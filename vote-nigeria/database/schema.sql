-- ============================================================
--  VOTE NIGERIA  -  PostgreSQL Database Schema
--  School project. Run with: psql -U <user> -d votedb -f schema.sql
-- ============================================================

-- 1. NIN citizens registry (acts as the "real NIN server" demo)
CREATE TABLE IF NOT EXISTS citizens (
    nin          VARCHAR(11) PRIMARY KEY,
    full_name    VARCHAR(120) NOT NULL,
    state        VARCHAR(60)  NOT NULL,
    lga          VARCHAR(80)  NOT NULL,
    phone1       VARCHAR(15)  NOT NULL,
    phone2       VARCHAR(15)  NOT NULL,
    is_admin     BOOLEAN DEFAULT FALSE
);

-- 2. Registered voters (phone numbers that have "logged in" on the site)
CREATE TABLE IF NOT EXISTS registered_voters (
    id           SERIAL PRIMARY KEY,
    phone        VARCHAR(15) UNIQUE NOT NULL,
    nin          VARCHAR(11) NOT NULL,
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (nin) REFERENCES citizens(nin)
);

-- 3. Active session token (only one NIN may be active at a time)
CREATE TABLE IF NOT EXISTS active_sessions (
    id           SERIAL PRIMARY KEY,
    nin          VARCHAR(11) UNIQUE NOT NULL,
    phone        VARCHAR(15) NOT NULL,
    started_at   TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (nin) REFERENCES citizens(nin)
);

-- 4. Elections
CREATE TABLE IF NOT EXISTS elections (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(120) NOT NULL,
    type         VARCHAR(20)  NOT NULL,  -- 'president' | 'governor' | 'lga'
    state        VARCHAR(60),            -- governor: only this state's residents vote
    lga          VARCHAR(80),            -- lga: only this lga's residents vote
    start_time   TIMESTAMP NOT NULL,
    end_time     TIMESTAMP NOT NULL,
    status       VARCHAR(15) DEFAULT 'ongoing'  -- 'ongoing' | 'ended'
);

-- 5. Candidates
CREATE TABLE IF NOT EXISTS candidates (
    id           SERIAL PRIMARY KEY,
    election_id  INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    name         VARCHAR(120) NOT NULL,
    party        VARCHAR(80)  NOT NULL,
    logo_url     VARCHAR(255),
    votes        INT DEFAULT 0
);

-- 6. Votes (one vote per voter per election)
CREATE TABLE IF NOT EXISTS votes (
    id           SERIAL PRIMARY KEY,
    voter_nin    VARCHAR(11) NOT NULL,
    election_id  INT NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
    candidate_id INT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    voted_at     TIMESTAMP DEFAULT NOW(),
    UNIQUE (voter_nin, election_id)
);

-- 7. Support messages (dashboard -> admin chat)
CREATE TABLE IF NOT EXISTS support_messages (
    id           SERIAL PRIMARY KEY,
    voter_phone  VARCHAR(15) NOT NULL,
    sender       VARCHAR(10) NOT NULL,   -- 'voter' | 'admin'
    body         TEXT NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);

-- 8. News posts for "Nigeria Today"
CREATE TABLE IF NOT EXISTS news (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(200) NOT NULL,
    subtitle     VARCHAR(255),
    body         TEXT NOT NULL,
    image_url    VARCHAR(255),
    category     VARCHAR(40) DEFAULT 'General',
    created_at   TIMESTAMP DEFAULT NOW()
);

-- ============== SEED DATA: the "real NIN server" ==============
INSERT INTO citizens (nin, full_name, state, lga, phone1, phone2, is_admin) VALUES
('52281679025', 'Okechukwu Great',    'Imo',     'Ikeduru',     '08034678812', '09122712205', FALSE),
('62873852101', 'Yusuf Kalistus',     'Kano',    'Dala',        '08055448160', '07160603258', FALSE),
('81875612791', 'Oladeti Loveth',     'Lagos',   'Apapa',       '08170314860', '07062490123', FALSE),
('52271069814', 'Chibuike Paul',      'Anambra', 'Orumba North','08028843818', '08028843818', TRUE);
