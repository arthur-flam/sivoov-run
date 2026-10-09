-- A course only the race's demo runs (the 5 km demo of the 10 km des Champs-Élysées): the real
-- race's pages never list it, its demo race plays it like the others.
ALTER TABLE courses ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
