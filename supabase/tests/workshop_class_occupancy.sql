BEGIN;
DO $$
DECLARE
  test_class uuid;
  occupied integer;
BEGIN
  INSERT INTO public.classes(date,start_time,end_time,capacity_ideal,capacity_max,status,audience,teacher)
  VALUES ('2099-11-23','11:00','13:00',7,7,'scheduled','adults','Cande') RETURNING id INTO test_class;
  INSERT INTO public.workshops(date,start_time,end_time,title,client_name,attendees,class_id)
  VALUES ('2099-11-23','11:00','13:00','Occupancy regression','Fictitious visitor A + B',2,test_class);
  IF public.class_seats_taken(test_class) <> 2 THEN RAISE EXCEPTION 'Two independent visitors must occupy two seats'; END IF;
  SELECT booked_count INTO occupied FROM public.public_class_availability() WHERE class_id=test_class;
  IF occupied IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'Public availability must count two independent visitors'; END IF;
  UPDATE public.workshops SET class_id=NULL WHERE class_id=test_class;
  IF public.class_seats_taken(test_class) <> 0 THEN RAISE EXCEPTION 'Unlinked workshops must not occupy class seats'; END IF;
END $$;
ROLLBACK;