# Admin Audit Ledger - Testing Guide

This guide will help you test the Admin Audit Ledger system to ensure it's working correctly.

## Prerequisites
- Backend server running (`node server.js`)
- Super Admin account exists
- JWT token for Super Admin

## Step 1: Generate Some Audit Logs

### 1.1 Log in as Super Admin
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@crambrunch.com",
    "password": "SuperAdmin@123"
  }'
```
Save the returned JWT token - you'll need it for subsequent requests.

### 1.2 Create a Teacher Account (generates CREATE_USER log)
```bash
curl -X POST http://localhost:5000/api/auth/create-teacher \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Dr. John Smith",
    "email": "john.smith@example.com",
    "department": "Computer Science",
    "subjects": ["Data Structures", "Algorithms"],
    "qualification": "Ph.D Computer Science",
    "experience": 10,
    "phone": "+1234567890"
  }'
```

### 1.3 Create an HOD Account
```bash
curl -X POST http://localhost:5000/api/auth/create-hod \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "Prof. Sarah Johnson",
    "email": "sarah.hod@example.com",
    "department": "Computer Science",
    "phone": "+1234567891"
  }'
```

### 1.4 Toggle User Status (generates UPDATE_USER log)
```bash
curl -X PATCH http://localhost:5000/api/auth/users/USER_ID_HERE/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "isActive": false
  }'
```

## Step 2: View Audit Logs

### 2.1 Get All Audit Logs
```bash
curl -X GET http://localhost:5000/api/auth/audit-logs \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "userId": "...",
      "userEmail": "superadmin@crambrunch.com",
      "userRole": "super_admin",
      "action": "CREATE_USER",
      "resourceType": "USER",
      "description": "super_admin created teacher: john.smith@example.com",
      "ipAddress": "127.0.0.1",
      "userAgent": "curl/7.68.0",
      "timestamp": "2024-04-22T15:30:45.123Z",
      "newValues": {
        "name": "Dr. John Smith",
        "email": "john.smith@example.com",
        "role": "teacher",
        "department": "Computer Science"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 5,
    "pages": 1
  }
}
```

### 2.2 Get Audit Logs for Specific Action
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/action/CREATE_USER" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.3 Get Audit Logs by User Email
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs?userEmail=superadmin@crambrunch.com" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.4 Filter by Resource Type
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs?resourceType=USER" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.5 Filter by Date Range
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs?startDate=2024-04-20&endDate=2024-04-25" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.6 Get User-Specific Audit Trail
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/user/USER_ID_HERE" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.7 Get Audit Statistics
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/stats" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "stats": {
    "totalLogs": 5,
    "logsLast7Days": 5,
    "logsToday": 5,
    "actionBreakdown": [
      { "_id": "CREATE_USER", "count": 2 },
      { "_id": "LOGIN", "count": 1 },
      { "_id": "UPDATE_USER", "count": 1 },
      { "_id": "CREATE_HOD", "count": 1 }
    ],
    "userBreakdown": [
      { "_id": "super_admin", "count": 5 }
    ],
    "resourceBreakdown": [
      { "_id": "USER", "count": 3 },
      { "_id": "AUTH", "count": 2 }
    ],
    "topUsers": [
      { "_id": "superadmin@crambrunch.com", "count": 5 }
    ]
  }
}
```

### 2.8 Export Audit Logs to CSV
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs/export?startDate=2024-04-20&endDate=2024-04-25" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o audit-logs-backup.csv
```

This will download a CSV file with all audit logs from the specified date range.

## Step 3: Verify Immutability

### 3.1 Try to Update an Audit Log (Should Fail)
```bash
curl -X PATCH http://localhost:5000/api/audit-logs/LOG_ID_HERE \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "action": "MODIFIED_ACTION"
  }'
```

**Expected Response:**
```json
{
  "error": "Audit logs cannot be updated"
}
```

## Step 4: Verify Access Control

### 4.1 Try to Access Audit Logs as Non-Super Admin (Should Fail)
Log in as HOD/Teacher and try:
```bash
curl -X GET http://localhost:5000/api/auth/audit-logs \
  -H "Authorization: Bearer HOD_JWT_TOKEN"
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Only Super Admin can view audit logs"
}
```

## Testing Checklist

- [ ] Login with Super Admin account
- [ ] Create a teacher account (generates log)
- [ ] Create an HOD account (generates log)
- [ ] Toggle user status (generates log)
- [ ] View all audit logs
- [ ] Filter logs by action type
- [ ] Filter logs by user email
- [ ] Filter logs by date range
- [ ] Get audit statistics
- [ ] Export logs to CSV
- [ ] Verify logs cannot be modified
- [ ] Verify non-admins cannot view logs
- [ ] Check that IP address is captured
- [ ] Verify timestamps are accurate

## Expected Log Entries

After completing the steps above, you should see logs similar to:

```
1. Super Admin login
2. Create teacher (John Smith)
3. Create HOD (Sarah Johnson)
4. Toggle user status (if applicable)
```

## Common Issues & Solutions

### Issue: "Only Super Admin can view audit logs"
**Solution:** Ensure you're using the JWT token from the Super Admin login

### Issue: Empty audit logs
**Solution:** Ensure you've performed at least one action (login, create user, etc.) before querying logs

### Issue: CSV export shows corrupted data
**Solution:** Ensure date parameters are in ISO 8601 format: YYYY-MM-DD

### Issue: Pagination not working
**Solution:** Add page and limit parameters: `?page=1&limit=50`

## Performance Testing

### Test with Large Date Ranges
```bash
curl -X GET "http://localhost:5000/api/auth/audit-logs?startDate=2024-01-01&endDate=2024-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test with Pagination
```bash
# Get page 2
curl -X GET "http://localhost:5000/api/auth/audit-logs?page=2&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get with larger limit
curl -X GET "http://localhost:5000/api/auth/audit-logs?page=1&limit=100" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Monitoring Dashboard Ideas

The audit system supports building a dashboard that shows:
1. Real-time activity feed
2. Login history with IP tracking
3. User management actions
4. Student approval workflow
5. System usage statistics
6. Suspicious activity alerts
7. Data change history (old vs new values)

## Notes

- Audit logs are created asynchronously to avoid blocking main requests
- If audit logging fails, the main operation still succeeds (fail-safe design)
- All timestamps are in ISO 8601 format (UTC)
- IP addresses help detect suspicious access patterns
- User agents can identify bot-based access attempts

## Success Criteria

✅ Audit logs are created for all major actions
✅ Logs cannot be modified or deleted
✅ Only Super Admin can access logs
✅ Logs include full metadata (IP, User Agent, etc.)
✅ Statistics and export functions work correctly
✅ Performance is acceptable with large datasets
