-- A demo race (the organizers' testers, App Review) borrows the courses and the sound of the
-- race it demonstrates; everything else (runners, runs, results, admin) is its own.
ALTER TABLE races ADD COLUMN demo_of TEXT REFERENCES races(id);
