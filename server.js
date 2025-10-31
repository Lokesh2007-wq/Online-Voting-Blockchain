const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static('public'));

// MySQL Database Connection with connection pooling
// Note: mysql2 rejects some legacy connection options when passed to a Connection.
// Keep only supported pool options here to avoid warnings.
const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'blockvote'
});

// Test database connection
db.getConnection((err, connection) => {
    if (err) {
        console.error('Database connection failed: ' + err.stack);
        return;
    }
    console.log('Connected to BlockVote MySQL database as id ' + connection.threadId);
    connection.release();
});

// ============================================================================
// Authentication & Admin Routes
// ============================================================================

// Admin login
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;

    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    const query = `SELECT id, username, email, role, full_name, department, last_login 
                   FROM admin_users 
                   WHERE username = ? AND password_hash = ? AND is_active = TRUE`;

    db.query(query, [username, passwordHash], (err, results) => {
        if (err) {
            console.error('Admin login error:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const admin = results[0];

        // Update last login
        db.query('UPDATE admin_users SET last_login = NOW() WHERE id = ?', [admin.id]);

        // Log admin login
        const logQuery = `INSERT INTO audit_logs (user_id, user_type, action, resource_type, details) 
                         VALUES (?, 'admin', 'LOGIN', 'system', ?)`;
        db.query(logQuery, [admin.id, JSON.stringify({ ip: req.ip, user_agent: req.get('User-Agent') })]);

        res.json({
            success: true,
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
                fullName: admin.full_name,
                department: admin.department
            }
        });
    });
});

// ============================================================================
// Elections API Routes
// ============================================================================

// Get all elections
app.get('/api/elections', (req, res) => {
    // Use DISTINCT counts to avoid multiplicative results from joining candidates and votes
    const query = `SELECT e.*, 
                   COUNT(DISTINCT c.id) as candidate_count,
                   COUNT(DISTINCT v.id) as vote_count
                   FROM elections e
                   LEFT JOIN candidates c ON e.id = c.election_id AND c.is_active = TRUE
                   LEFT JOIN votes v ON e.id = v.election_id AND v.verification_status = 'verified'
                   GROUP BY e.id
                   ORDER BY e.created_at DESC`;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching elections:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get election by ID with candidates
app.get('/api/elections/:id', (req, res) => {
    const { id } = req.params;

    const electionQuery = 'SELECT * FROM elections WHERE id = ?';
    const candidatesQuery = 'SELECT * FROM candidates WHERE election_id = ? AND is_active = TRUE ORDER BY display_order';

    db.query(electionQuery, [id], (err, electionResults) => {
        if (err) {
            console.error('Error fetching election:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (electionResults.length === 0) {
            return res.status(404).json({ error: 'Election not found' });
        }

        db.query(candidatesQuery, [id], (err, candidatesResults) => {
            if (err) {
                console.error('Error fetching candidates:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            const election = electionResults[0];
            election.candidates = candidatesResults;

            res.json(election);
        });
    });
});

// Create new election
app.post('/api/elections', (req, res) => {
    const { title, description, type, start_date, end_date, voting_method, privacy_level, requires_verification } = req.body;

    if (!title || !start_date || !end_date) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const blockchainAddress = '0x' + crypto.randomBytes(20).toString('hex');

    const query = `INSERT INTO elections (title, description, type, start_date, end_date, voting_method, 
                   privacy_level, requires_verification, blockchain_address) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(query, [title, description, type, start_date, end_date, voting_method, privacy_level, requires_verification, blockchainAddress], 
        (err, results) => {
            if (err) {
                console.error('Error creating election:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.status(201).json({ 
                message: 'Election created successfully',
                id: results.insertId,
                blockchain_address: blockchainAddress
            });
        });
});

// Update election
app.put('/api/elections/:id', (req, res) => {
    const { id } = req.params;
    const { title, description, type, status, start_date, end_date, voting_method, privacy_level } = req.body;

    const query = `UPDATE elections SET title = ?, description = ?, type = ?, status = ?, 
                   start_date = ?, end_date = ?, voting_method = ?, privacy_level = ? 
                   WHERE id = ?`;

    db.query(query, [title, description, type, status, start_date, end_date, voting_method, privacy_level, id], 
        (err, results) => {
            if (err) {
                console.error('Error updating election:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Election not found' });
            }

            res.json({ message: 'Election updated successfully' });
        });
});

// Delete election
app.delete('/api/elections/:id', (req, res) => {
    const { id } = req.params;

    const query = 'DELETE FROM elections WHERE id = ?';

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error deleting election:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Election not found' });
        }

        res.json({ message: 'Election deleted successfully' });
    });
});

// ============================================================================
// Candidates API Routes
// ============================================================================

// Get all candidates for an election
app.get('/api/elections/:id/candidates', (req, res) => {
    const { id } = req.params;

    const query = `SELECT c.*, COUNT(v.id) as vote_count
                   FROM candidates c
                   LEFT JOIN votes v ON c.id = v.candidate_id AND v.verification_status = 'verified'
                   WHERE c.election_id = ? AND c.is_active = TRUE
                   GROUP BY c.id
                   ORDER BY c.display_order`;

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error fetching candidates:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Add candidate to election
app.post('/api/elections/:id/candidates', (req, res) => {
    const { id } = req.params;
    const { name, party, platform, biography, photo_url, contact_email, display_order } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Candidate name is required' });
    }

    const query = `INSERT INTO candidates (election_id, name, party, platform, biography, 
                   photo_url, contact_email, display_order) 
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(query, [id, name, party, platform, biography, photo_url, contact_email, display_order || 0], 
        (err, results) => {
            if (err) {
                console.error('Error adding candidate:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.status(201).json({ 
                message: 'Candidate added successfully',
                id: results.insertId
            });
        });
});

// Update candidate
app.put('/api/candidates/:id', (req, res) => {
    const { id } = req.params;
    const { name, party, platform, biography, photo_url, contact_email, display_order } = req.body;

    const query = `UPDATE candidates SET name = ?, party = ?, platform = ?, biography = ?, 
                   photo_url = ?, contact_email = ?, display_order = ? 
                   WHERE id = ?`;

    db.query(query, [name, party, platform, biography, photo_url, contact_email, display_order, id], 
        (err, results) => {
            if (err) {
                console.error('Error updating candidate:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (results.affectedRows === 0) {
                return res.status(404).json({ error: 'Candidate not found' });
            }

            res.json({ message: 'Candidate updated successfully' });
        });
});

// Delete candidate
app.delete('/api/candidates/:id', (req, res) => {
    const { id } = req.params;

    const query = 'UPDATE candidates SET is_active = FALSE WHERE id = ?';

    db.query(query, [id], (err, results) => {
        if (err) {
            console.error('Error deleting candidate:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Candidate not found' });
        }

        res.json({ message: 'Candidate deleted successfully' });
    });
});

// ============================================================================
// Voting API Routes
// ============================================================================

// Submit vote
app.post('/api/vote', (req, res) => {
    const { election_id, candidate_id, voter_address, vote_data, signature } = req.body;

    if (!election_id || !candidate_id || !voter_address || !vote_data || !signature) {
        return res.status(400).json({ error: 'Missing required voting data' });
    }

    // Check if election is active
    const electionQuery = 'SELECT status, start_date, end_date FROM elections WHERE id = ?';

    db.query(electionQuery, [election_id], (err, electionResults) => {
        if (err) {
            console.error('Error checking election:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (electionResults.length === 0) {
            return res.status(404).json({ error: 'Election not found' });
        }

        const election = electionResults[0];
        const now = new Date();

        let reason = null;
        const startDate = new Date(election.start_date);
        const endDate = new Date(election.end_date);
        if (now < startDate) {
            reason = 'not_started';
        } else if (now > endDate) {
            reason = 'ended';
        } else if (election.status !== 'active') {
            reason = 'inactive';
        }

        if (reason) {
            // Log rejected vote attempt to audit_logs for traceability
            try {
                const details = JSON.stringify({
                    reason,
                    status: election.status,
                    start_date: election.start_date,
                    end_date: election.end_date,
                    now: now.toISOString(),
                    candidate_id: candidate_id || null,
                    voter_address: voter_address || null
                });

                const logQuery = `INSERT INTO audit_logs (user_id, user_type, action, resource_type, details) VALUES (?, 'voter', 'VOTE_REJECTED', 'election', ?)`;
                // user_id is an integer in the schema; we don't have a numeric user id for anonymous voters
                // so pass NULL for user_id and keep the voter's public address inside details JSON.
                db.query(logQuery, [null, details], (logErr) => {
                    if (logErr) console.error('Error logging rejected vote:', logErr);
                    // Respond with structured error after attempting to log
                    return res.status(400).json({ 
                        error: 'Election is not currently accepting votes', 
                        reason,
                        status: election.status,
                        start_date: election.start_date,
                        end_date: election.end_date,
                        now: now.toISOString()
                    });
                });
            } catch (logEx) {
                console.error('Audit log error:', logEx);
                return res.status(400).json({ 
                    error: 'Election is not currently accepting votes', 
                    reason,
                    status: election.status,
                    start_date: election.start_date,
                    end_date: election.end_date,
                    now: now.toISOString()
                });
            }

            return;
        }

        // Verify candidate exists, belongs to this election, and is active
        const candidateQuery = 'SELECT id, election_id, is_active FROM candidates WHERE id = ?';
        db.query(candidateQuery, [candidate_id], (candErr, candResults) => {
            if (candErr) {
                console.error('Error checking candidate:', candErr);
                return res.status(500).json({ error: 'Database error' });
            }

            if (candResults.length === 0) {
                return res.status(400).json({ error: 'Invalid candidate' });
            }

            const candidate = candResults[0];
            if (candidate.election_id != election_id) {
                return res.status(400).json({ error: 'Candidate does not belong to election' });
            }
            if (!candidate.is_active) {
                return res.status(400).json({ error: 'Candidate is not active' });
            }

            // Create blockchain transaction
            // Generate 31-byte random value (62 hex chars) and prefix '0x' to match DB VARCHAR(64)
            // This keeps transaction_hash length at 64 characters to avoid column size errors.
            let transactionHex = crypto.randomBytes(31).toString('hex'); // 62 hex chars
            let transactionHash = '0x' + transactionHex; // total length = 64
            // Defensive: ensure not to exceed DB column size (64)
            if (transactionHash.length > 64) transactionHash = transactionHash.slice(0, 64);
            const transactionQuery = `INSERT INTO blockchain_transactions 
                                     (transaction_hash, election_id, voter_address, candidate_id, vote_data, signature, status) 
                                     VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`;

            db.query(transactionQuery, [transactionHash, election_id, voter_address, candidate_id, JSON.stringify(vote_data), signature], 
                (err, txResults) => {
                    if (err) {
                        console.error('Error creating transaction:', err);
                        console.error('Attempted transactionHash length:', transactionHash.length, 'value:', transactionHash);
                        // Log transaction failure to audit_logs for investigation
                        try {
                            const details = JSON.stringify({
                                error: err.sqlMessage || err.message,
                                code: err.code,
                                election_id,
                                candidate_id,
                                voter_address,
                                transactionHash,
                                transactionHashLength: transactionHash.length,
                                vote_data_sample: typeof vote_data === 'object' ? JSON.stringify(vote_data).slice(0, 1000) : String(vote_data),
                                timestamp: new Date().toISOString()
                            });
                            const logQuery = `INSERT INTO audit_logs (user_id, user_type, action, resource_type, details) VALUES (?, 'system', 'TRANSACTION_FAILED', 'blockchain_transaction', ?)`;
                            db.query(logQuery, [null, details], (logErr) => {
                                if (logErr) console.error('Error logging transaction failure:', logErr);
                                // If error indicates data too long, return a clearer message for the client
                                if (err && err.code === 'ER_DATA_TOO_LONG') {
                                    return res.status(500).json({ error: 'Transaction creation failed', detail: 'Data too long for a column (likely transaction_hash). Server has truncated generated hashes to fit DB limits.' });
                                }

                                // respond with more detailed message for debugging
                                return res.status(500).json({ error: 'Transaction creation failed', detail: err.sqlMessage || err.message });
                            });
                        } catch (le) {
                            console.error('Error while logging transaction failure:', le);
                            return res.status(500).json({ error: 'Transaction creation failed' });
                        }
                        return;
                    }

                    // Create vote record
                    const voterHash = crypto.createHash('sha256').update(voter_address + Date.now()).digest('hex').substring(0, 12);
                    const voteQuery = `INSERT INTO votes (transaction_id, election_id, candidate_id, voter_id, verification_status) 
                                      VALUES (?, ?, ?, ?, 'verified')`;

                    db.query(voteQuery, [txResults.insertId, election_id, candidate_id, 'ANON_' + voterHash], 
                        (err, voteResults) => {
                            if (err) {
                                console.error('Error creating vote:', err);
                                return res.status(500).json({ error: 'Vote recording failed' });
                            }

                            // Build a clear receipt object to return to the client
                            const receiptObj = {
                                transaction_id: txResults.insertId,
                                transactionHash: transactionHash,
                                timestamp: new Date().toISOString(),
                                election_id: election_id,
                                verification_code: voterHash
                            };

                            console.log('Vote recorded successfully:', { transactionHash, receipt: receiptObj });

                            res.json({
                                success: true,
                                transaction_hash: transactionHash,
                                message: 'Vote submitted successfully',
                                receipt: receiptObj
                            });
                        });
                });
        });
    });
});

// ============================================================================
// Results API Routes
// ============================================================================

// Get election results
app.get('/api/elections/:id/results', (req, res) => {
    const { id } = req.params;

    const query = `SELECT 
        c.id, c.name, c.party, c.photo_url,
        COUNT(v.id) as vote_count,
        ROUND(COUNT(v.id) * 100.0 / NULLIF(total.total_votes, 0), 2) as percentage
    FROM candidates c
    LEFT JOIN votes v ON c.id = v.candidate_id AND v.verification_status = 'verified'
    CROSS JOIN (
        SELECT COUNT(*) as total_votes 
        FROM votes v2 
        JOIN candidates c2 ON v2.candidate_id = c2.id 
        WHERE c2.election_id = ? AND v2.verification_status = 'verified'
    ) total
    WHERE c.election_id = ? AND c.is_active = TRUE
    GROUP BY c.id, c.name, c.party, c.photo_url, total.total_votes
    ORDER BY vote_count DESC`;

    db.query(query, [id, id], (err, results) => {
        if (err) {
            console.error('Error fetching results:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        // Get total votes
        const totalVotes = results.reduce((sum, candidate) => sum + candidate.vote_count, 0);

        res.json({
            total_votes: totalVotes,
            candidates: results
        });
    });
});

// ----------------------------------------------------------------------------
// Admin API: Update election metadata (status, start_date, end_date)
// Protected via ADMIN_API_TOKEN environment variable for simplicity
// ----------------------------------------------------------------------------
app.patch('/api/admin/elections/:id', (req, res) => {
    const token = req.get('x-admin-token') || req.query.token;
    if (!process.env.ADMIN_API_TOKEN || token !== process.env.ADMIN_API_TOKEN) {
        return res.status(403).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status, start_date, end_date } = req.body;

    // Build update parts
    const updates = [];
    const params = [];
    if (typeof status !== 'undefined') {
        updates.push('status = ?');
        params.push(status);
    }
    if (typeof start_date !== 'undefined') {
        updates.push('start_date = ?');
        params.push(start_date);
    }
    if (typeof end_date !== 'undefined') {
        updates.push('end_date = ?');
        params.push(end_date);
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
    }

    params.push(id);
    const query = `UPDATE elections SET ${updates.join(', ')} WHERE id = ?`;
    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error updating election via admin API:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        if (results.affectedRows === 0) {
            return res.status(404).json({ error: 'Election not found' });
        }

        // Log admin change
        const logQuery = `INSERT INTO audit_logs (user_id, user_type, action, resource_type, details) VALUES (?, 'admin', 'UPDATE_ELECTION', 'election', ?)`;
        const details = JSON.stringify({ status, start_date, end_date, admin_api: true });
        db.query(logQuery, [null, details], (logErr) => {
            if (logErr) console.error('Error logging election update:', logErr);
        });

        res.json({ message: 'Election updated successfully' });
    });
});

// ============================================================================
// Blockchain API Routes
// ============================================================================

// Get blockchain statistics
app.get('/api/blockchain/stats', (req, res) => {
    const query = `SELECT 
        (SELECT COUNT(*) FROM blockchain_blocks) as total_blocks,
        (SELECT COUNT(*) FROM blockchain_transactions) as total_transactions,
        (SELECT COUNT(*) FROM votes WHERE verification_status = 'verified') as verified_votes,
        (SELECT COUNT(*) FROM voters WHERE registration_status = 'verified') as registered_voters,
        (SELECT COUNT(*) FROM elections WHERE status = 'active') as active_elections,
        (SELECT setting_value FROM system_settings WHERE setting_key = 'network_nodes') as network_nodes`;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching blockchain stats:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results[0]);
    });
});

// Get recent blocks
app.get('/api/blockchain/blocks', (req, res) => {
    const limit = req.query.limit || 10;

    const query = `SELECT block_number, current_hash, previous_hash, timestamp, transaction_count, block_size
                   FROM blockchain_blocks 
                   ORDER BY block_number DESC 
                   LIMIT ?`;

    db.query(query, [parseInt(limit)], (err, results) => {
        if (err) {
            console.error('Error fetching blocks:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Get recent transactions
app.get('/api/blockchain/transactions', (req, res) => {
    const limit = req.query.limit || 20;

    const query = `SELECT t.transaction_hash, t.timestamp, t.status, t.gas_used,
                   e.title as election_title, c.name as candidate_name
                   FROM blockchain_transactions t
                   JOIN elections e ON t.election_id = e.id
                   JOIN candidates c ON t.candidate_id = c.id
                   ORDER BY t.timestamp DESC
                   LIMIT ?`;

    db.query(query, [parseInt(limit)], (err, results) => {
        if (err) {
            console.error('Error fetching transactions:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// ============================================================================
// Admin Dashboard API Routes
// ============================================================================

// Get admin dashboard data
app.get('/api/admin/dashboard', (req, res) => {
    const queries = {
        stats: `SELECT 
            (SELECT COUNT(*) FROM elections) as total_elections,
            (SELECT COUNT(*) FROM elections WHERE status = 'active') as active_elections,
            (SELECT COUNT(*) FROM candidates WHERE is_active = TRUE) as total_candidates,
            (SELECT COUNT(*) FROM votes WHERE verification_status = 'verified') as total_votes`,

        recentActivity: `SELECT activity_type, timestamp, description, details 
                        FROM recent_activity LIMIT 10`,

        systemHealth: `SELECT setting_key, setting_value, description 
                      FROM system_settings 
                      WHERE setting_key IN ('current_block_height', 'total_transactions', 'network_nodes')`
    };

    const dashboardData = {};
    let completed = 0;
    const total = Object.keys(queries).length;

    Object.keys(queries).forEach(key => {
        db.query(queries[key], (err, results) => {
            if (err) {
                console.error(`Error fetching ${key}:`, err);
                return res.status(500).json({ error: 'Database error' });
            }

            dashboardData[key] = key === 'stats' ? results[0] : results;

            completed++;
            if (completed === total) {
                res.json(dashboardData);
            }
        });
    });
});

// Get audit logs
app.get('/api/admin/audit-logs', (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const query = `SELECT a.*, u.username 
                   FROM audit_logs a
                   LEFT JOIN admin_users u ON a.user_id = u.id
                   ORDER BY a.timestamp DESC
                   LIMIT ? OFFSET ?`;

    db.query(query, [limit, offset], (err, results) => {
        if (err) {
            console.error('Error fetching audit logs:', err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    db.query('SELECT 1 as healthy', (err, results) => {
        if (err) {
            return res.status(500).json({ status: 'ERROR', database: 'disconnected', error: err.message });
        }

        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '1.0.0'
        });
    });
});

// Start server with explicit error handling for common startup failures
const server = app.listen(PORT, () => {
    console.log(`BlockVote server running on port ${PORT}`);
    console.log(`Access the application at: http://localhost:${PORT}`);
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Another process is listening on that port.`);
        console.error('If you previously started the server, stop that process or choose a different PORT.');
        // Provide a friendly hint including the platform-specific command to find and stop the process
        console.error('On Windows (PowerShell) you can run:');
        console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | Select-Object -Unique OwningProcess ; Get-Process -Id <PID>`);
        process.exit(1);
    } else {
        console.error('Server error during startup:', err);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down BlockVote server gracefully...');
    db.end(() => {
        console.log('Database connections closed.');
        process.exit();
    });
});