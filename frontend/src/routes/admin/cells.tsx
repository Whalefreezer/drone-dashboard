import React from 'react';

export function Mono({ children }: { children: React.ReactNode }) {
  return <span style={{ fontFamily: 'monospace' }}>{children}</span>;
}

export function Right({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', textAlign: 'right' }}>{children}</span>;
}

export function Center({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', textAlign: 'center' }}>{children}</span>;
}

