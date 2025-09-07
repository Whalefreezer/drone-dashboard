import { createFileRoute } from '@tanstack/react-router';
import { useAtomValue } from 'jotai';
import { ingestTargetRecordsAtom } from '../../state/pbAtoms.ts';
import { IngestTargetsTable } from './IngestTargetsTable.tsx';

function IngestPage() {
  const ingestTargets = useAtomValue(ingestTargetRecordsAtom);
  return (
    <div className='admin-page' style={{ padding: 16, display: 'grid', gap: 16 }}>
      <div className='section-card'>
        <h2>Ingest Targets</h2>
        {ingestTargets.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <IngestTargetsTable data={ingestTargets} />
          </div>
        ) : (
          <p className='muted'>No ingest targets found.</p>
        )}
      </div>
    </div>
  );
}

// @ts-ignore type quirk noted in repo
export const Route = createFileRoute('/admin/ingest')({ component: IngestPage });

