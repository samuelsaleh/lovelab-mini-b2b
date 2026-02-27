'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ApproveResultContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const name = searchParams.get('name') || 'this user';

  const config = {
    approved: {
      icon: '✓',
      iconColor: '#27ae60',
      iconBg: '#eafaf1',
      title: `Access approved for ${name}`,
      message: 'They will receive an email to set their password and can log in shortly.',
    },
    rejected: {
      icon: '✗',
      iconColor: '#dc2626',
      iconBg: '#fef2f2',
      title: `Request rejected for ${name}`,
      message: 'They have been notified by email.',
    },
    already_actioned: {
      icon: '!',
      iconColor: '#d97706',
      iconBg: '#fffbeb',
      title: `Already actioned`,
      message: `This request for ${name} was already approved or rejected.`,
    },
    invalid: {
      icon: '?',
      iconColor: '#6b7280',
      iconBg: '#f9fafb',
      title: 'Invalid link',
      message: 'This approval link is invalid or has expired.',
    },
    error: {
      icon: '!',
      iconColor: '#dc2626',
      iconBg: '#fef2f2',
      title: 'Something went wrong',
      message: 'An error occurred. Please try again or check the Supabase dashboard.',
    },
  };

  const c = config[status] || config.invalid;

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
      padding: '20px',
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 16,
        padding: '48px 40px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: 420,
        width: '100%',
      }}>
        <img src="/logo.png" alt="LoveLab" style={{ height: 48, marginBottom: 24 }} />
        <div style={{
          width: 60, height: 60, borderRadius: '50%',
          background: c.iconBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 28, color: c.iconColor, fontWeight: 700,
        }}>
          {c.icon}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a', margin: '0 0 10px' }}>
          {c.title}
        </h2>
        <p style={{ fontSize: 14, color: '#666', margin: '0 0 28px', lineHeight: 1.6 }}>
          {c.message}
        </p>
        <a
          href="/login"
          style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: '#5D3A5E',
            color: '#fff',
            textDecoration: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          Back to Login
        </a>
      </div>
    </div>
  );
}

export default function ApproveResultPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
      <ApproveResultContent />
    </Suspense>
  );
}
