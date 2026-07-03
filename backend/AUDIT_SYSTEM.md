# Admin Audit Ledger System

## Overview
The Admin Audit Ledger maintains a permanent, unchangeable record of all system actions for complete transparency and accountability. Every action performed in the CRAMBRUNCH system is logged with detailed metadata.

## Features
- **Immutable Records**: All audit logs are write-once, append-only. They cannot be modified or deleted
- **Comprehensive Tracking**: Logs capture who did what, when, where, and how
- **Advanced Filtering**: Query logs by user, action, resource type, and date range
- **Statistical Analysis**: View audit statistics and trends
- **Export Capability**: Download audit logs in CSV format for external analysis
- **Performance**: Optimized indexes for fast querying of large datasets

## Logged Actions

### Authentication & User Management
- `LOGIN` - User login
- `LOGOUT` - User logout
- `CREATE_USER` - New user account creation
- `UPDATE_USER` - User information updates
- `DELETE_USER` - User account deletion
- `PASSWORD_RESET` - Password reset request and completion
- `EMAIL_VERIFICATION` - Email verification
- `PROFILE_UPDATE` - Profile information updates

### User Approval & Status
- `APPROVE_STUDENT` - HOD approves student registration
- `REJECT_STUDENT` - HOD rejects student registration
- `TOGGLE_USER_STATUS` - Activate/deactivate user accounts
- `CREATE_TEACHER` - HOD/Super Admin creates teacher account
- `CREATE_HOD` - Super Admin creates HOD account

### Academic Operations
- `ATTENDANCE_MARKED` - Attendance marking
- `MARKS_UPDATED` - Marks entered or modified
- `GRIEVANCE_SUBMITTED` - Student grievance submission
- `GRIEVANCE_RESOLVED` - Grievance resolution
- `MATERIAL_UPLOADED` - Course material upload
- `TIMETABLE_UPDATED` - Timetable changes
- `SKILLHUB_ACCESS` - Skill hub access

### System Operations
- `NOTIFICATION_SENT` - System notifications
- `FEEDBACK_SUBMITTED` - Feedback submission
- `SYSTEM_CONFIG_CHANGE` - System configuration changes

## API Endpoints

All audit endpoints require Super Admin authentication.

### Get All Audit Logs
```http
GET /api/auth/audit-logs
```
**Query Parameters:**
- `page` (default: 1) - Page number for pagination
- `limit` (default: 50) - Number of records per page
- `action` - Filter by action type (e.g., LOGIN, CREATE_USER)
- `userEmail` - Filter by user email (supports regex)
- `resourceType` - Filter by resource type (e.g., USER, STUDENT)
- `startDate` - Start date for range (ISO 8601 format)
- `endDate` - End date for range (ISO 8601 format)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "userEmail": "user@example.com",
      "userRole": "super_admin",
      "action": "LOGIN",
      "resourceType": "AUTH",
      "description": "super_admin logged in",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2024-04-22T10:30:00Z",
      "newValues": null,
      "oldValues": null,
      "metadata": {}
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150,
    "pages": 3
  }
}
```

### Get User-Specific Audit Logs
```http
GET /api/auth/audit-logs/user/:userId
```
**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)

**Response:** Returns all audit logs for a specific user

### Get Logs by Action
```http
GET /api/auth/audit-logs/action/:action
```
**Parameters:**
- `action` - Action type (converted to uppercase automatically)

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)

**Response:** Returns all logs for a specific action type

### Get Audit Statistics
```http
GET /api/auth/audit-logs/stats
```
**Response:**
```json
{
  "success": true,
  "stats": {
    "totalLogs": 5432,
    "logsLast7Days": 234,
    "logsToday": 42,
    "actionBreakdown": [
      { "_id": "LOGIN", "count": 1200 },
      { "_id": "CREATE_USER", "count": 450 },
      { "_id": "UPDATE_USER", "count": 320 }
    ],
    "userBreakdown": [
      { "_id": "super_admin", "count": 1500 },
      { "_id": "hod", "count": 2000 },
      { "_id": "teacher", "count": 1500 }
    ],
    "resourceBreakdown": [
      { "_id": "USER", "count": 1200 },
      { "_id": "STUDENT", "count": 2000 },
      { "_id": "AUTH", "count": 1500 }
    ],
    "topUsers": [
      { "_id": "admin@example.com", "count": 450 },
      { "_id": "hod@example.com", "count": 380 }
    ]
  }
}
```

### Export Audit Logs
```http
GET /api/auth/audit-logs/export
```
**Query Parameters:**
- `startDate` - Start date for export (ISO 8601 format)
- `endDate` - End date for export (ISO 8601 format)

**Response:** CSV file download with filename `audit-logs-YYYY-MM-DD.csv`

## Log Record Structure

Each audit log record contains:

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Unique record identifier |
| `userId` | ObjectId | ID of user who performed action |
| `userEmail` | String | Email of user who performed action |
| `userRole` | String | Role of user (super_admin, hod, teacher, student, parent) |
| `action` | String | Type of action performed |
| `resourceType` | String | Type of resource affected |
| `resourceId` | ObjectId | ID of affected resource (optional) |
| `description` | String | Human-readable description of action |
| `oldValues` | Mixed | Previous values for UPDATE actions |
| `newValues` | Mixed | New values for CREATE/UPDATE actions |
| `ipAddress` | String | IP address of request source |
| `userAgent` | String | Browser/client information |
| `metadata` | Object | Additional contextual data |
| `timestamp` | Date | Immutable timestamp (cannot be modified) |

## Security Features

1. **Immutability**: Once written, audit logs cannot be modified or deleted
2. **Comprehensive Metadata**: IP addresses and user agents are captured for security analysis
3. **Role-Based Access**: Only Super Admins can view audit logs
4. **Indexed for Performance**: Multiple indexes ensure fast querying without performance impact
5. **Permanent Storage**: Logs are stored separately from user data for integrity

## Examples

### Example 1: Find all login attempts in the last 7 days
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs?action=LOGIN&startDate=2024-04-15&endDate=2024-04-22" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 2: Get all actions by a specific user
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/user/USER_ID_HERE" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 3: Get all user creation events
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/action/CREATE_USER" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 4: Export logs from specific date range
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/export?startDate=2024-04-01&endDate=2024-04-30" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o audit-logs-april.csv
```

## Compliance & Compliance

The audit system helps maintain compliance with:
- **Data Protection**: Track who accessed and modified sensitive data
- **Accountability**: Maintain records of all administrative actions
- **Security Audits**: Identify suspicious patterns or unauthorized access attempts
- **Incident Investigation**: Reconstruct events for incident response
- **Regulatory Requirements**: Meet audit trail requirements for educational institutions

## Best Practices

1. **Regular Review**: Periodically review audit logs for suspicious activities
2. **Archive Logs**: Export and archive old logs for long-term compliance
3. **Monitor Top Users**: Watch for unusual activity patterns from frequently logged-in users
4. **Investigate Anomalies**: Investigate any unexpected action sequences
5. **Access Control**: Ensure only Super Admin accounts can access audit logs

## Database Schema

The audit logs are stored in the `audit_logs` collection with the following indexes:

```javascript
// Indexes for efficient querying
auditSchema.index({ userId: 1, timestamp: -1 });
auditSchema.index({ action: 1, timestamp: -1 });
auditSchema.index({ resourceType: 1, timestamp: -1 });
auditSchema.index({ timestamp: -1 });
auditSchema.index({ userEmail: 1 });
```

These indexes ensure:
- Fast filtering by user
- Quick action-based queries
- Efficient date range queries
- Performance even with millions of records

## Troubleshooting

### Cannot View Audit Logs
- **Issue**: "Only Super Admin can view audit logs"
- **Solution**: Ensure you're logged in with Super Admin account and have valid JWT token

### CSV Export Not Working
- **Issue**: Getting binary data or empty file
- **Solution**: Ensure startDate and endDate are in valid ISO 8601 format (YYYY-MM-DD)

### Slow Audit Queries
- **Issue**: Audit log queries taking too long
- **Solution**: Check if proper indexes exist on database. System automatically creates them on startup.

## Version History

- **v1.0.0** (2024-04-22) - Initial release with comprehensive audit logging system
  - Immutable audit logs
  - Multiple query endpoints
  - Statistical analysis
  - CSV export capability
  - Role-based access control
