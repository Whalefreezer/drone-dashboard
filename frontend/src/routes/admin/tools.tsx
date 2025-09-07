import { createFileRoute } from '@tanstack/react-router';

function ToolsPage() {
  return (
    <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div className='section-card'>
        <h2>Tools</h2>
        <p className='muted'>Coming soon: Devtools, scenario loader, snapshots, import/export.</p>
      </div>
    </div>
  );
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/tools')({ component: ToolsPage });

