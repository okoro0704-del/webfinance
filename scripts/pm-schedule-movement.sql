-- Timed leg movement: admin schedules start + duration; trackers animate between stops.

ALTER TABLE pm.deliveries
  ADD COLUMN IF NOT EXISTS movement_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS movement_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS movement_from_stop_id UUID REFERENCES pm.delivery_stops(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS movement_to_stop_id UUID REFERENCES pm.delivery_stops(id) ON DELETE SET NULL;

ALTER TABLE pm.deliveries
  DROP CONSTRAINT IF EXISTS deliveries_movement_duration_minutes_check;

ALTER TABLE pm.deliveries
  ADD CONSTRAINT deliveries_movement_duration_minutes_check
  CHECK (
    movement_duration_minutes IS NULL
    OR movement_duration_minutes BETWEEN 1 AND 10080
  );

COMMENT ON COLUMN pm.deliveries.movement_started_at IS
  'When the current leg begins moving on the map (admin-scheduled).';
COMMENT ON COLUMN pm.deliveries.movement_duration_minutes IS
  'Transit duration for the current leg; trackers animate from→to during this window.';

CREATE OR REPLACE FUNCTION pm.clear_delivery_movement(p_delivery_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
BEGIN
  UPDATE pm.deliveries
  SET
    movement_started_at = NULL,
    movement_duration_minutes = NULL,
    movement_from_stop_id = NULL,
    movement_to_stop_id = NULL,
    updated_at = timezone('utc', now())
  WHERE id = p_delivery_id;
END;
$$;

CREATE OR REPLACE FUNCTION pm.schedule_delivery_movement(
  p_delivery_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_duration_minutes INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
DECLARE
  v_delivery pm.deliveries;
  v_current pm.delivery_stops;
  v_next pm.delivery_stops;
  v_starts TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR NOT pm.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can schedule movement'
      USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes IS NULL OR p_duration_minutes < 1 OR p_duration_minutes > 10080 THEN
    RAISE EXCEPTION 'Duration must be between 1 and 10080 minutes';
  END IF;

  v_starts := COALESCE(p_starts_at, timezone('utc', now()));

  SELECT * INTO v_delivery
  FROM pm.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.company_id IS DISTINCT FROM pm.auth_company_id() THEN
    RAISE EXCEPTION 'Delivery does not belong to your company'
      USING ERRCODE = '42501';
  END IF;

  IF v_delivery.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot schedule movement for status %', v_delivery.status;
  END IF;

  SELECT * INTO v_current
  FROM pm.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND status = 'current'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery has no current stop';
  END IF;

  SELECT * INTO v_next
  FROM pm.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND stop_order = v_current.stop_order + 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Already at the final stop — use Proceed to mark delivered';
  END IF;

  UPDATE pm.deliveries
  SET
    movement_started_at = v_starts,
    movement_duration_minutes = p_duration_minutes,
    movement_from_stop_id = v_current.id,
    movement_to_stop_id = v_next.id,
    status = CASE
      WHEN v_starts <= timezone('utc', now()) THEN 'in_transit'::pm.delivery_status
      ELSE status
    END,
    estimated_delivery_at = COALESCE(
      estimated_delivery_at,
      v_starts + make_interval(mins => p_duration_minutes)
    ),
    updated_at = timezone('utc', now())
  WHERE id = p_delivery_id
  RETURNING * INTO v_delivery;

  INSERT INTO pm.delivery_location_history (
    delivery_id, stop_id, location_name, latitude, longitude, event_type, notes
  )
  VALUES (
    p_delivery_id,
    v_current.id,
    v_current.name,
    v_current.latitude,
    v_current.longitude,
    'departed',
    format(
      'Movement scheduled from %s to %s starting %s (%s min)',
      v_current.name,
      v_next.name,
      v_starts,
      p_duration_minutes
    )
  );

  RETURN jsonb_build_object(
    'delivery', to_jsonb(v_delivery),
    'from_stop', to_jsonb(v_current),
    'to_stop', to_jsonb(v_next),
    'movement_started_at', v_delivery.movement_started_at,
    'movement_duration_minutes', v_delivery.movement_duration_minutes,
    'status', v_delivery.status
  );
END;
$$;

CREATE OR REPLACE FUNCTION pm.finalize_delivery_movement_if_due(
  p_delivery_id UUID DEFAULT NULL,
  p_tracking_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
DECLARE
  v_delivery pm.deliveries;
  v_from pm.delivery_stops;
  v_to pm.delivery_stops;
  v_end TIMESTAMPTZ;
BEGIN
  IF p_delivery_id IS NOT NULL THEN
    SELECT * INTO v_delivery FROM pm.deliveries WHERE id = p_delivery_id FOR UPDATE;
  ELSIF p_tracking_number IS NOT NULL AND btrim(p_tracking_number) <> '' THEN
    SELECT * INTO v_delivery
    FROM pm.deliveries
    WHERE tracking_number = upper(btrim(p_tracking_number))
    FOR UPDATE;
  ELSE
    RETURN jsonb_build_object('finalized', false, 'reason', 'missing_id');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'not_found');
  END IF;

  IF v_delivery.movement_started_at IS NULL
     OR v_delivery.movement_duration_minutes IS NULL
     OR v_delivery.movement_from_stop_id IS NULL
     OR v_delivery.movement_to_stop_id IS NULL THEN
    RETURN jsonb_build_object('finalized', false, 'reason', 'no_movement');
  END IF;

  v_end := v_delivery.movement_started_at
    + make_interval(mins => v_delivery.movement_duration_minutes);

  IF timezone('utc', now()) < v_end THEN
    -- Promote to in_transit once the window has opened
    IF v_delivery.status IS DISTINCT FROM 'in_transit'
       AND v_delivery.movement_started_at <= timezone('utc', now())
       AND v_delivery.status NOT IN ('delivered', 'cancelled') THEN
      UPDATE pm.deliveries
      SET status = 'in_transit', updated_at = timezone('utc', now())
      WHERE id = v_delivery.id
      RETURNING * INTO v_delivery;
    END IF;
    RETURN jsonb_build_object(
      'finalized', false,
      'reason', 'in_progress',
      'ends_at', v_end,
      'status', v_delivery.status
    );
  END IF;

  SELECT * INTO v_from FROM pm.delivery_stops WHERE id = v_delivery.movement_from_stop_id FOR UPDATE;
  SELECT * INTO v_to FROM pm.delivery_stops WHERE id = v_delivery.movement_to_stop_id FOR UPDATE;

  IF NOT FOUND OR v_to.id IS NULL THEN
    PERFORM pm.clear_delivery_movement(v_delivery.id);
    RETURN jsonb_build_object('finalized', false, 'reason', 'stops_missing');
  END IF;

  -- Complete from-stop if still current
  UPDATE pm.delivery_stops
  SET
    status = 'completed',
    completed_at = COALESCE(completed_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  WHERE id = v_from.id
    AND status IS DISTINCT FROM 'completed';

  UPDATE pm.delivery_stops
  SET
    status = 'current',
    arrived_at = COALESCE(arrived_at, timezone('utc', now())),
    updated_at = timezone('utc', now())
  WHERE id = v_to.id;

  UPDATE pm.deliveries
  SET
    current_stop_id = v_to.id,
    status = 'at_stop',
    movement_started_at = NULL,
    movement_duration_minutes = NULL,
    movement_from_stop_id = NULL,
    movement_to_stop_id = NULL,
    updated_at = timezone('utc', now())
  WHERE id = v_delivery.id
  RETURNING * INTO v_delivery;

  INSERT INTO pm.delivery_location_history (
    delivery_id, stop_id, location_name, latitude, longitude, event_type, notes
  )
  VALUES (
    v_delivery.id,
    v_to.id,
    v_to.name,
    v_to.latitude,
    v_to.longitude,
    'arrived',
    format('Arrived at %s after scheduled transit', v_to.name)
  );

  RETURN jsonb_build_object(
    'finalized', true,
    'delivery', to_jsonb(v_delivery),
    'current_stop_id', v_to.id,
    'status', v_delivery.status
  );
END;
$$;

-- Include movement payload in public tracking
CREATE OR REPLACE FUNCTION pm.get_public_tracking(
  p_tracking_number TEXT,
  p_company_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
DECLARE
  v_delivery pm.deliveries;
  v_current pm.delivery_stops;
  v_from pm.delivery_stops;
  v_to pm.delivery_stops;
  v_result JSONB;
  v_branding JSONB;
  v_company_status pm.company_status;
  v_movement JSONB;
BEGIN
  IF p_tracking_number IS NULL OR btrim(p_tracking_number) = '' THEN
    RAISE EXCEPTION 'Tracking number is required';
  END IF;

  -- Auto-finalize overdue legs before reading
  PERFORM pm.finalize_delivery_movement_if_due(NULL, p_tracking_number);

  SELECT * INTO v_delivery
  FROM pm.deliveries
  WHERE tracking_number = upper(btrim(p_tracking_number));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  IF p_company_id IS NOT NULL AND v_delivery.company_id <> p_company_id THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  SELECT status INTO v_company_status
  FROM pm.companies
  WHERE id = v_delivery.company_id;

  IF v_company_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'found', false,
      'message', 'No delivery found for this tracking number'
    );
  END IF;

  SELECT * INTO v_current
  FROM pm.delivery_stops
  WHERE id = v_delivery.current_stop_id;

  v_branding := pm.get_public_company_branding(v_delivery.company_id);

  v_movement := NULL;
  IF v_delivery.movement_started_at IS NOT NULL
     AND v_delivery.movement_duration_minutes IS NOT NULL
     AND v_delivery.movement_from_stop_id IS NOT NULL
     AND v_delivery.movement_to_stop_id IS NOT NULL THEN
    SELECT * INTO v_from FROM pm.delivery_stops WHERE id = v_delivery.movement_from_stop_id;
    SELECT * INTO v_to FROM pm.delivery_stops WHERE id = v_delivery.movement_to_stop_id;
    IF v_from.id IS NOT NULL AND v_to.id IS NOT NULL THEN
      v_movement := jsonb_build_object(
        'started_at', v_delivery.movement_started_at,
        'duration_minutes', v_delivery.movement_duration_minutes,
        'ends_at', v_delivery.movement_started_at
          + make_interval(mins => v_delivery.movement_duration_minutes),
        'from', jsonb_build_object(
          'id', v_from.id,
          'name', v_from.name,
          'latitude', v_from.latitude,
          'longitude', v_from.longitude,
          'stop_order', v_from.stop_order
        ),
        'to', jsonb_build_object(
          'id', v_to.id,
          'name', v_to.name,
          'latitude', v_to.latitude,
          'longitude', v_to.longitude,
          'stop_order', v_to.stop_order
        )
      );
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'found', true,
    'tracking_number', v_delivery.tracking_number,
    'status', v_delivery.status,
    'origin', jsonb_build_object(
      'name', v_delivery.origin_name,
      'latitude', v_delivery.origin_latitude,
      'longitude', v_delivery.origin_longitude
    ),
    'destination', jsonb_build_object(
      'name', v_delivery.destination_name,
      'latitude', v_delivery.destination_latitude,
      'longitude', v_delivery.destination_longitude
    ),
    'current_location', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude,
        'stop_order', v_current.stop_order,
        'status', v_current.status
      )
    END,
    'current_stop', CASE
      WHEN v_current.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'name', v_current.name,
        'stop_order', v_current.stop_order,
        'status', v_current.status,
        'arrived_at', v_current.arrived_at,
        'latitude', v_current.latitude,
        'longitude', v_current.longitude
      )
    END,
    'completed_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'arrived_at', s.arrived_at,
          'completed_at', s.completed_at,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM pm.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'completed'
    ), '[]'::jsonb),
    'upcoming_stops', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', s.name,
          'stop_order', s.stop_order,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', s.status
        )
        ORDER BY s.stop_order
      )
      FROM pm.delivery_stops s
      WHERE s.delivery_id = v_delivery.id
        AND s.status = 'upcoming'
    ), '[]'::jsonb),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'location_name', h.location_name,
          'event_type', h.event_type,
          'created_at', h.created_at
        )
        ORDER BY h.created_at
      )
      FROM pm.delivery_location_history h
      WHERE h.delivery_id = v_delivery.id
    ), '[]'::jsonb),
    'estimated_delivery_at', v_delivery.estimated_delivery_at,
    'last_updated', v_delivery.updated_at,
    'branding', v_branding,
    'movement', v_movement
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- Proceed clears / completes an active scheduled leg early
CREATE OR REPLACE FUNCTION pm.proceed_to_next_stop(p_delivery_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pm, public, auth, extensions
AS $$
DECLARE
  v_delivery pm.deliveries;
  v_current pm.delivery_stops;
  v_next pm.delivery_stops;
  v_is_final BOOLEAN := FALSE;
  v_end TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL OR NOT pm.is_admin() THEN
    RAISE EXCEPTION 'Only authenticated admins can proceed a delivery'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_delivery
  FROM pm.deliveries
  WHERE id = p_delivery_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_delivery.company_id IS DISTINCT FROM pm.auth_company_id() THEN
    RAISE EXCEPTION 'Delivery does not belong to your company'
      USING ERRCODE = '42501';
  END IF;

  IF v_delivery.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot proceed a delivery with status %', v_delivery.status;
  END IF;

  -- Early arrive: if a timed leg is active, force the window closed and finalize
  IF v_delivery.movement_to_stop_id IS NOT NULL THEN
    UPDATE pm.deliveries
    SET movement_started_at = timezone('utc', now())
          - make_interval(mins => GREATEST(COALESCE(movement_duration_minutes, 1), 1)),
        updated_at = timezone('utc', now())
    WHERE id = p_delivery_id;

    PERFORM pm.finalize_delivery_movement_if_due(p_delivery_id, NULL);

    SELECT * INTO v_delivery FROM pm.deliveries WHERE id = p_delivery_id;

    RETURN jsonb_build_object(
      'delivery', to_jsonb(v_delivery),
      'previous_stop_id', v_delivery.movement_from_stop_id,
      'current_stop_id', v_delivery.current_stop_id,
      'is_delivered', v_delivery.status = 'delivered',
      'status', v_delivery.status
    );
  END IF;

  SELECT * INTO v_current
  FROM pm.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND status = 'current'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery has no current stop';
  END IF;

  SELECT * INTO v_next
  FROM pm.delivery_stops
  WHERE delivery_id = p_delivery_id
    AND stop_order = v_current.stop_order + 1
  FOR UPDATE;

  v_is_final := NOT FOUND;

  IF v_is_final THEN
    UPDATE pm.delivery_stops
    SET status = 'completed',
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_current.id;

    UPDATE pm.deliveries
    SET status = 'delivered',
        current_stop_id = v_current.id,
        updated_at = timezone('utc', now())
    WHERE id = p_delivery_id
    RETURNING * INTO v_delivery;

    INSERT INTO pm.delivery_location_history (
      delivery_id, stop_id, location_name, latitude, longitude, event_type, notes
    )
    VALUES (
      p_delivery_id, v_current.id, v_current.name, v_current.latitude, v_current.longitude,
      'delivered', 'Delivery completed at final destination'
    );
  ELSE
    UPDATE pm.delivery_stops
    SET status = 'completed',
        completed_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = v_current.id;

    INSERT INTO pm.delivery_location_history (
      delivery_id, stop_id, location_name, latitude, longitude, event_type, notes
    )
    VALUES (
      p_delivery_id, v_current.id, v_current.name, v_current.latitude, v_current.longitude,
      'departed', format('Departed %s', v_current.name)
    );

    UPDATE pm.delivery_stops
    SET status = 'current',
        arrived_at = COALESCE(arrived_at, timezone('utc', now())),
        updated_at = timezone('utc', now())
    WHERE id = v_next.id;

    UPDATE pm.deliveries
    SET current_stop_id = v_next.id,
        status = 'at_stop',
        updated_at = timezone('utc', now())
    WHERE id = p_delivery_id
    RETURNING * INTO v_delivery;

    INSERT INTO pm.delivery_location_history (
      delivery_id, stop_id, location_name, latitude, longitude, event_type, notes
    )
    VALUES (
      p_delivery_id, v_next.id, v_next.name, v_next.latitude, v_next.longitude,
      'arrived', format('Arrived at %s', v_next.name)
    );
  END IF;

  RETURN jsonb_build_object(
    'delivery', to_jsonb(v_delivery),
    'previous_stop_id', v_current.id,
    'current_stop_id', v_delivery.current_stop_id,
    'is_delivered', v_delivery.status = 'delivered',
    'status', v_delivery.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION pm.schedule_delivery_movement(UUID, TIMESTAMPTZ, INTEGER)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION pm.finalize_delivery_movement_if_due(UUID, TEXT)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pm.clear_delivery_movement(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION pm.get_public_tracking(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION pm.proceed_to_next_stop(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
