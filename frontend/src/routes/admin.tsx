import { createFileRoute, redirect } from '@tanstack/react-router';
import { isAuthenticated } from '../api/pb.ts';
import AdminPage from './admin/AdminPage.tsx';

export const Route = createFileRoute('/admin')({
  beforeLoad: () => {
    if (!isAuthenticated()) {
      throw redirect({ to: '/login' });
    }
  },
  component: AdminPage,
});

