/**
 * Centralized email templates for LoveLab B2B.
 * Each function returns an { subject, html } object ready for Resend.
 */

const BRAND_COLOR = '#5D3A5E';

function layout(siteUrl, bodyHtml) {
  return `
    <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
      <img src="${siteUrl}/logo.png" alt="LoveLab" style="height: 48px; margin-bottom: 24px;" />
      ${bodyHtml}
      <p style="color: #ccc; font-size: 11px; margin-top: 24px;">
        LoveLab B2B &middot; This email was sent automatically.
      </p>
    </div>
  `;
}

function button(href, label) {
  return `<a href="${href}" style="display: inline-block; padding: 14px 32px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">${label}</a>`;
}

export function welcomeAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, you're invited to LoveLab B2B`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">LoveLab B2B</strong> as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Click the button below to sign in — no password needed.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab B2B')}
      <p style="color: #aaa; font-size: 12px; margin-top: 24px;">
        You can also sign in anytime at <a href="${siteUrl}/login" style="color: ${BRAND_COLOR};">${siteUrl.replace('https://', '')}</a> using Google.
      </p>
    `),
  };
}

export function upgradeAgentEmail(agentName, siteUrl) {
  return {
    subject: `${agentName}, you're now a LoveLab sales partner`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${agentName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been added as a <strong style="color: ${BRAND_COLOR};">LoveLab sales partner</strong>. Your orders and commissions will now be tracked automatically.
      </p>
      ${button(`${siteUrl}/login`, 'Go to LoveLab B2B')}
    `),
  };
}

export function restoreAgentEmail(agentName, signInUrl, siteUrl) {
  return {
    subject: `${agentName}, your LoveLab B2B access has been restored`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Your access has been restored</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Hi ${agentName}, your access to <strong style="color: ${BRAND_COLOR};">LoveLab B2B</strong> has been restored. You can now log back in.
      </p>
      ${button(signInUrl, 'Sign in to LoveLab B2B')}
    `),
  };
}

export function orderNotificationEmail({ documentType, clientCompany, clientName, totalAmount, eventName, creatorName }, siteUrl) {
  const isOrder = documentType === 'order';
  const amount = (totalAmount || 0).toLocaleString('fr-FR');
  return {
    subject: isOrder
      ? `New order: ${clientCompany || clientName} — €${amount}`
      : `New quote: ${clientCompany || clientName}`,
    html: layout(siteUrl, `
      <h2 style="color: ${BRAND_COLOR}; margin: 0 0 16px;">
        ${isOrder ? 'New Order Created' : 'New Quote Created'}
      </h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#666;width:140px">Client</td><td style="padding:6px 0;font-weight:600">${clientCompany || clientName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Contact</td><td style="padding:6px 0">${clientName || '—'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Amount</td><td style="padding:6px 0;font-weight:600;color:${BRAND_COLOR}">€${amount}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Folder</td><td style="padding:6px 0">${eventName || 'No folder'}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Created by</td><td style="padding:6px 0">${creatorName}</td></tr>
        <tr><td style="padding:6px 0;color:#666">Type</td><td style="padding:6px 0;text-transform:capitalize">${documentType}</td></tr>
      </table>
      ${button(`${siteUrl}/dashboard`, 'View in Dashboard')}
    `),
  };
}

export function approvedSignupEmail(fullName, siteUrl) {
  return {
    subject: 'Your LoveLab B2B access has been approved!',
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome, ${fullName}!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Your request to access LoveLab B2B has been <strong style="color: #27ae60;">approved</strong>.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You should receive a separate email from Supabase to set your password. Once set, you can log in:
      </p>
      ${button(`${siteUrl}/login`, 'Go to LoveLab B2B')}
    `),
  };
}

export function orgInvitationEmail(orgName, siteUrl) {
  return {
    subject: `You're invited to join ${orgName} on LoveLab B2B`,
    html: layout(siteUrl, `
      <h2 style="color: #1a1a1a; margin: 0 0 8px;">You're invited!</h2>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        You've been invited to join <strong style="color: ${BRAND_COLOR};">${orgName}</strong> on LoveLab B2B as a sales partner.
      </p>
      <p style="color: #555; font-size: 15px; margin: 0 0 24px;">
        Sign in or create your account to get started.
      </p>
      ${button(`${siteUrl}/login`, 'Sign in to LoveLab B2B')}
    `),
  };
}
