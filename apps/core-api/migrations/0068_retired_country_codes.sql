-- The country register stops offering retired ISO 3166-1 codes (031): ICU
-- still names them, so Serbia was listed as CS, RS and YU, Russia as RU and SU,
-- the United Kingdom as GB and UK. An account that picked one keeps the
-- country it picked, under the current code for the same name.
update accounts set country = moved.current
from (values
  ('AN', 'CW'),
  ('BU', 'MM'),
  ('CS', 'RS'),
  ('DD', 'DE'),
  ('DY', 'BJ'),
  ('FX', 'FR'),
  ('HV', 'BF'),
  ('NH', 'VU'),
  ('RH', 'ZW'),
  ('SU', 'RU'),
  ('TP', 'TL'),
  ('UK', 'GB'),
  ('VD', 'VN'),
  ('YD', 'YE'),
  ('YU', 'RS'),
  ('ZR', 'CD')
) as moved(retired, current)
where accounts.country = moved.retired;
