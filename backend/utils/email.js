const nodemailer = require('nodemailer');

let transporter;

const setupEmailTransporter = async () => {
  if (!transporter) {
    const hasCustomSmtp = process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS;

    if (hasCustomSmtp) {
      transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT || 587),
        secure: String(process.env.EMAIL_SECURE || 'false') === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      console.log('Email transporter configured with SMTP credentials from environment.');
    } else {
      // Fallback test inbox for local development when real SMTP is not configured.
      const testAccount = await nodemailer.createTestAccount();

      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });

      console.log('No SMTP credentials found. Using Ethereal test inbox for email delivery.');
      console.log('User:', testAccount.user);
      console.log('Pass:', testAccount.pass);
      console.log('View emails at: https://ethereal.email');
    }
  }

  return transporter;
};

const sendEmail = async (to, subject, html) => {
  try {
    const activeTransporter = await setupEmailTransporter();
    const info = await activeTransporter.sendMail({
      from: process.env.EMAIL_FROM || '"CRAMBRUNCH" <noreply@crambrunch.com>',
      to,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log('Preview URL:', previewUrl);
    }

    return { success: true };
  } catch (error) {
    console.error('Email error:', error);
    return { success: false, error };
  }
};

const sendOTPEmail = async (email, otp) => {
  const subject = 'Your OTP for CRAMBRUNCH';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #007bff; text-align: center;">CRAMBRUNCH - Email Verification</h2>
      <p>Hello,</p>
      <p>Your OTP code for email verification is:</p>
      <div style="font-size: 32px; font-weight: bold; color: #007bff; padding: 20px; border: 2px solid #007bff; text-align: center; margin: 20px 0; border-radius: 8px;">
        ${otp}
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this verification, please ignore this email.</p>
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">
        This is a test email from CRAMBRUNCH development environment.
      </p>
    </div>
  `;

  console.log(`Verification OTP generated for ${email}: ${otp}`);
  return sendEmail(email, subject, html);
};

const sendPasswordResetEmail = async (email, otp) => {
  const subject = 'Password Reset OTP for CRAMBRUNCH';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc3545; text-align: center;">CRAMBRUNCH - Password Reset</h2>
      <p>Hello,</p>
      <p>Your password reset OTP code is:</p>
      <div style="font-size: 32px; font-weight: bold; color: #dc3545; padding: 20px; border: 2px solid #dc3545; text-align: center; margin: 20px 0; border-radius: 8px;">
        ${otp}
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this password reset, please ignore this email.</p>
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">
        This is a test email from CRAMBRUNCH development environment.
      </p>
    </div>
  `;

  console.log(`Password reset OTP generated for ${email}: ${otp}`);
  return sendEmail(email, subject, html);
};

const sendParentNotification = async (parentEmail, studentName, studentEmail) => {
  const subject = 'Your Child\'s Account Registration - CRAMBRUNCH';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">CRAMBRUNCH - Student Registration Approved</h2>
      <p>Dear Parent/Guardian,</p>
      <p>We are pleased to inform you that your child's registration has been approved by the Head of Department.</p>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Student Name:</strong> ${studentName}</p>
        <p><strong>Student Email:</strong> ${studentEmail}</p>
      </div>
      <p>Your child can now log in to the CRAMBRUNCH platform using their registered email and password.</p>
      <p>You can also create a parent account to monitor your child's academic progress and receive notifications.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:5000" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Access CRAMBRUNCH</a>
      </div>
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">
        This is a test email from CRAMBRUNCH development environment.
      </p>
    </div>
  `;

  console.log(`Parent notification sent to ${parentEmail} for student ${studentName}`);
  return sendEmail(parentEmail, subject, html);
};

const sendParentCredentials = async (email, parentName, studentName, loginEmail, password) => {
  const subject = 'Your CRAMBRUNCH Parent Portal Credentials';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #28a745; text-align: center;">CRAMBRUNCH - Parent Portal Ready</h2>
      <p>Dear ${parentName || 'Parent/Guardian'},</p>
      <p>${studentName}'s registration has been approved, and your parent portal account is now ready.</p>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Login Email:</strong> ${loginEmail}</p>
        <p><strong>Temporary Password:</strong> ${password}</p>
      </div>
      <p style="color: #dc3545; font-weight: bold;">Please sign in and change your password after your first login.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:5000" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Open Parent Portal</a>
      </div>
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">
        This is a test email from CRAMBRUNCH development environment.
      </p>
    </div>
  `;

  console.log(`Parent credentials sent to ${email} for ${studentName}`);
  return sendEmail(email, subject, html);
};

const sendTeacherCredentials = async (email, name, loginEmail, password) => {
  const subject = 'Your CRAMBRUNCH Account Credentials';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #17a2b8; text-align: center;">CRAMBRUNCH - Account Created</h2>
      <p>Dear ${name},</p>
      <p>Welcome to CRAMBRUNCH! Your account has been created successfully.</p>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p><strong>Email:</strong> ${loginEmail}</p>
        <p><strong>Temporary Password:</strong> ${password}</p>
      </div>
      <p style="color: #dc3545; font-weight: bold;">Please change your password after first login for security.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="http://localhost:5000" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Login to CRAMBRUNCH</a>
      </div>
      <hr style="margin: 30px 0;">
      <p style="color: #666; font-size: 12px; text-align: center;">
        This is a test email from CRAMBRUNCH development environment.
      </p>
    </div>
  `;

  console.log(`Teacher credentials sent to ${email} for ${name}`);
  return sendEmail(email, subject, html);
};

module.exports = {
  sendOTPEmail,
  sendPasswordResetEmail,
  sendParentNotification,
  sendParentCredentials,
  sendTeacherCredentials
};
