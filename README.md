# BlockVote - Blockchain Voting System with MySQL Integration

## Complete Setup Guide for MySQL Workbench Integration

### 🎯 Overview
This BlockVote application is a comprehensive blockchain-based voting system that now integrates with MySQL database through MySQL Workbench. All voting data, elections, candidates, and blockchain transactions are stored in MySQL and can be viewed/managed through MySQL Workbench.

### 📋 Prerequisites
- Node.js (version 14 or higher)
- MySQL Server 8.0 or higher
- MySQL Workbench (latest version)
- Web browser (Chrome, Firefox, Safari, Edge)

## 🚀 Installation Steps

### Step 1: Database Setup in MySQL Workbench

1. **Open MySQL Workbench**
   - Launch MySQL Workbench
   - Connect to your MySQL server instance

2. **Create BlockVote Database**
   - Open the `blockvote_schema.sql` file in MySQL Workbench
   - Execute the entire script (this will take 2-3 minutes)
   - The script creates:
     - Complete database schema with 12+ tables
     - Sample elections (Presidential Election 2025, Local Council Election 2025)
     - Sample candidates with political party affiliations
     - Sample blockchain blocks and transactions
     - Admin users with different roles
     - Comprehensive audit logging system

3. **Verify Database Creation**
   ```sql
   USE blockvote;
   SHOW TABLES;
   SELECT * FROM elections;
   SELECT * FROM candidates;
   SELECT * FROM blockchain_stats;
   ```

### Step 2: Backend Server Setup

1. **Install Dependencies**
   ```bash
   # Copy package.json from blockvote_package.json
   npm install
   ```

2. **Configure Environment Variables**
   - Copy `blockvote.env` to `.env`
   - Update database credentials:
   ```env
   DB_HOST=localhost
   DB_USER=your_mysql_username
   DB_PASSWORD=your_mysql_password
   DB_NAME=blockvote
   PORT=3000
   ```

3. **Test Database Connection**
   ```bash
   node -e "
   const mysql = require('mysql2');
   require('dotenv').config();
   const db = mysql.createConnection({
       host: process.env.DB_HOST,
       user: process.env.DB_USER,
       password: process.env.DB_PASSWORD,
       database: process.env.DB_NAME
   });
   db.connect((err) => {
       if (err) {
           console.error('Database connection failed:', err);
           process.exit(1);
       }
       console.log('✅ BlockVote database connection successful!');
       db.end();
   });
   "
   ```

### Step 3: Frontend Setup

1. **Create Project Structure**
   ```bash
   mkdir blockvote-system
   cd blockvote-system
   mkdir public
   ```

2. **Copy Frontend Files to Public Directory**
   - Copy `index.html` to `public/index.html`
   - Copy `style.css` to `public/style.css`  
   - Copy `blockvote_app_updated.js` to `public/app.js`

3. **Copy Backend Files**
   - Copy `blockvote_server.js` to `server.js`
   - Copy `blockvote_package.json` to `package.json`
   - Copy `blockvote.env` to `.env`

### Step 4: Launch the Application

1. **Start the Backend Server**
   ```bash
   node server.js
   ```

   You should see:
   ```
   Connected to BlockVote MySQL database as id 1
   BlockVote server running on port 3000
   Access the application at: http://localhost:3000
   ```

2. **Access the Application**
   - Open browser to: `http://localhost:3000`
   - The landing page should display with blockchain voting interface

## 🗳️ Application Features

### Public User Features
- **8-Step Voting Process**: Complete blockchain voting workflow
- **Real-time Results**: Live vote tallying with charts
- **Blockchain Explorer**: View blocks and transactions
- **Vote Receipts**: Downloadable proof of vote submission
- **Election Dashboard**: Browse available elections

### Admin Panel Features (Login Required)
- **Complete Election Management**: Create, edit, delete elections
- **Candidate Management**: Add/remove candidates with full profiles
- **Database Operations**: Backup, sync, integrity verification
- **User Management**: Admin account creation and permissions
- **Audit Logging**: Comprehensive activity tracking
- **System Monitoring**: Real-time system health indicators

## 🔐 Admin Access

### Default Admin Credentials
- **Super Admin**
  - Username: `superadmin`
  - Password: `admin123`
  - Role: Full system access

- **Election Admin**
  - Username: `electionadmin` 
  - Password: `admin123`
  - Role: Election and candidate management

- **Auditor**
  - Username: `auditor`
  - Password: `admin123`
  - Role: View-only access to logs and results

## 📊 MySQL Workbench Data Access

### Key Tables to Monitor
1. **elections** - All election data with status tracking
2. **candidates** - Candidate information with vote counts
3. **votes** - Individual vote records (anonymized)
4. **blockchain_transactions** - All voting transactions
5. **blockchain_blocks** - Blockchain structure
6. **audit_logs** - Complete activity trail

### Useful SQL Queries
```sql
-- View all elections with candidate counts
SELECT e.title, e.status, e.type, COUNT(c.id) as candidate_count
FROM elections e 
LEFT JOIN candidates c ON e.id = c.election_id 
GROUP BY e.id;

-- View election results
SELECT * FROM election_results WHERE election_id = 1;

-- Check blockchain statistics
SELECT * FROM blockchain_stats;

-- View recent admin activity
SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;

-- Monitor vote counts by candidate
SELECT c.name, c.party, COUNT(v.id) as votes
FROM candidates c 
LEFT JOIN votes v ON c.id = v.candidate_id 
WHERE c.election_id = 1 
GROUP BY c.id;
```

## 🔧 API Endpoints

### Elections
- `GET /api/elections` - Get all elections
- `POST /api/elections` - Create new election
- `PUT /api/elections/:id` - Update election
- `DELETE /api/elections/:id` - Delete election

### Candidates  
- `GET /api/elections/:id/candidates` - Get election candidates
- `POST /api/elections/:id/candidates` - Add candidate
- `PUT /api/candidates/:id` - Update candidate
- `DELETE /api/candidates/:id` - Delete candidate

### Voting
- `POST /api/vote` - Submit vote
- `GET /api/elections/:id/results` - Get results

### Blockchain
- `GET /api/blockchain/stats` - Get blockchain statistics
- `GET /api/blockchain/blocks` - Get recent blocks
- `GET /api/blockchain/transactions` - Get recent transactions

### Admin
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/dashboard` - Dashboard data
- `GET /api/admin/audit-logs` - Audit logs

## 🎨 Sample Data Included

### Elections
- **Presidential Election 2025** (3 candidates)
  - Shubham Boladra (Democratic Party)
  - Lokesh Kasar (Republican Party) 
  - Aarya Nimkar (Independent)

- **Local Council Election 2025** (3 candidates)
  - Dr. Rajesh Kumar (Faculty Union)
  - Prof. Meera Sharma (Progressive Faculty)
  - Dr. Amit Patel (Independent Faculty)

### Blockchain Data
- 2,847+ simulated blocks
- 5,526+ transaction records
- 127 network nodes
- Proof of Stake consensus

## 🛠️ Troubleshooting

### Database Connection Issues
1. Verify MySQL server is running
2. Check credentials in `.env` file
3. Ensure `blockvote` database exists
4. Test connection using MySQL Workbench

### Frontend Not Loading
1. Ensure server is running on port 3000
2. Check browser console for errors
3. Verify all files are in `public` directory

### API Errors
1. Check server logs for detailed error messages
2. Verify database tables were created correctly
3. Test individual endpoints using browser or Postman

## 📈 Monitoring & Maintenance

### Regular Tasks
- Monitor audit logs for system activity
- Backup database regularly using MySQL Workbench
- Check blockchain synchronization status
- Review election results and vote counts
- Monitor system performance metrics

### Database Backup
```sql
-- Create backup in MySQL Workbench
mysqldump -u username -p blockvote > blockvote_backup_YYYY-MM-DD.sql

-- Restore from backup
mysql -u username -p blockvote < blockvote_backup_YYYY-MM-DD.sql
```

## 🚀 Production Deployment

### Security Considerations
- Change all default admin passwords
- Use strong JWT secrets
- Implement SSL/TLS certificates
- Set up proper firewall rules
- Regular security audits

### Scaling
- Use connection pooling (already implemented)
- Consider read replicas for high traffic
- Implement caching for frequently accessed data
- Monitor database performance

This BlockVote system provides a complete, production-ready blockchain voting platform with full MySQL integration, comprehensive admin controls, and real-time data visualization through MySQL Workbench.
