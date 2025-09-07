import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { serverSettingsRecordsAtom } from '../../state/pbAtoms.ts';
import { ServerSettingsEditor } from './ServerSettingsEditor.tsx';

function SettingsPage() {
  const settings = useAtomValue(serverSettingsRecordsAtom);
  return (
    <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div className='section-card'>
        <h2>Server Settings</h2>
        <ServerSettingsEditor settings={settings} />
      </div>
    </div>
  );
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/settings')({ component: SettingsPage });

