CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audience_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  tickets INT NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  email VARCHAR(120),
  ticket_code VARCHAR(36) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  age INT NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  email VARCHAR(120),
  outfit_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS makeup_artist_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  experience INT NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  email VARCHAR(120),
  specialization VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stall_submissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  business_name VARCHAR(160) NOT NULL,
  owner_name VARCHAR(120) NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  email VARCHAR(120),
  business_description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audience_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_code VARCHAR(36) NOT NULL UNIQUE,
  audience_id INT NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  tickets INT NOT NULL,
  contact_number VARCHAR(30),
  email VARCHAR(120),
  scanned_by INT,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
