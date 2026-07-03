const Audit = require('../models/Audit');

class AuditLogger {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  // Log an action
  async log(options) {
    const {
      userId,
      userEmail,
      userRole,
      action,
      resourceType,
      resourceId = null,
      description,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      userAgent = null,
      metadata = {}
    } = options;

    try {
      const auditEntry = new Audit({
        userId,
        userEmail,
        userRole,
        action,
        resourceType,
        resourceId,
        description,
        oldValues,
        newValues,
        ipAddress,
        userAgent,
        metadata,
        timestamp: new Date()
      });

      await auditEntry.save();
      console.log(`📊 Audit Log: ${action} by ${userEmail} on ${resourceType}`);
    } catch (error) {
      console.error('❌ Audit logging failed:', error.message);
      // Don't throw error to avoid breaking the main flow
    }
  }

  // Middleware to extract user info from request
  getUserInfo(req) {
    if (!req.user) return null;

    return {
      userId: req.user._id,
      userEmail: req.user.email,
      userRole: req.user.role
    };
  }

  // Middleware to extract request info
  getRequestInfo(req) {
    return {
      ipAddress: req.ip || req.connection.remoteAddress || req.socket.remoteAddress,
      userAgent: req.get('User-Agent')
    };
  }

  // Specific action loggers
  async logLogin(user, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'LOGIN',
      resourceType: 'AUTH',
      description: `${user.userRole} logged in`,
      ...requestInfo,
      metadata: {
        loginMethod: 'email'
      }
    });
  }

  async logLogout(user, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'LOGOUT',
      resourceType: 'AUTH',
      description: `${user.userRole} logged out`,
      ...requestInfo
    });
  }

  async logUserCreation(creator, newUser, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...creator,
      action: 'CREATE_USER',
      resourceType: 'USER',
      resourceId: newUser._id,
      description: `${creator.userRole} created ${newUser.role}: ${newUser.email}`,
      newValues: {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        department: newUser.department
      },
      ...requestInfo
    });
  }

  async logUserUpdate(updater, userId, oldValues, newValues, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...updater,
      action: 'UPDATE_USER',
      resourceType: 'USER',
      resourceId: userId,
      description: `${updater.userRole} updated user information`,
      oldValues,
      newValues,
      ...requestInfo
    });
  }

  async logUserDeletion(deleter, deletedUser, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...deleter,
      action: 'DELETE_USER',
      resourceType: 'USER',
      resourceId: deletedUser._id,
      description: `${deleter.userRole} deleted ${deletedUser.role}: ${deletedUser.email}`,
      oldValues: {
        name: deletedUser.name,
        email: deletedUser.email,
        role: deletedUser.role
      },
      ...requestInfo
    });
  }

  async logStudentApproval(approver, student, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...approver,
      action: 'APPROVE_STUDENT',
      resourceType: 'STUDENT',
      resourceId: student._id,
      description: `${approver.userRole} approved student: ${student.name} (${student.rollNumber})`,
      newValues: {
        approvalStatus: 'approved',
        approvedBy: approver.userId,
        approvedAt: new Date()
      },
      ...requestInfo
    });
  }

  async logStudentRejection(rejector, student, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...rejector,
      action: 'REJECT_STUDENT',
      resourceType: 'STUDENT',
      resourceId: student._id,
      description: `${rejector.userRole} rejected student: ${student.name} (${student.rollNumber})`,
      newValues: {
        approvalStatus: 'rejected',
        approvedBy: rejector.userId,
        approvedAt: new Date()
      },
      ...requestInfo
    });
  }

  async logPasswordReset(user, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'PASSWORD_RESET',
      resourceType: 'AUTH',
      description: `${user.userRole} reset password`,
      ...requestInfo
    });
  }

  async logEmailVerification(user, req) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'EMAIL_VERIFICATION',
      resourceType: 'AUTH',
      description: `${user.userRole} verified email`,
      ...requestInfo
    });
  }

  async logAuditView(user, req, metadata = {}) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'AUDIT_LOG_VIEWED',
      resourceType: 'AUDIT',
      description: `${user.userRole} viewed the admin audit ledger`,
      ...requestInfo,
      metadata
    });
  }

  async logAuditExport(user, req, metadata = {}) {
    const requestInfo = this.getRequestInfo(req);
    await this.log({
      ...user,
      action: 'AUDIT_LOG_EXPORTED',
      resourceType: 'AUDIT',
      description: `${user.userRole} exported admin audit ledger records`,
      ...requestInfo,
      metadata
    });
  }
}

// Export singleton instance
const auditLogger = new AuditLogger();

module.exports = auditLogger;
