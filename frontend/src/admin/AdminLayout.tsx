import { Link, Outlet } from '@tanstack/react-router';
import './admin.css';
import { authenticatedKind, logout } from '../api/pb.ts';
import React from 'react';

export function AdminLayout() {
	const userKind = authenticatedKind() ?? 'unknown';
	return (
		<div className='admin-layout'>
			<aside className='admin-sidebar'>
				<div className='brand'>Admin</div>
				<nav className='nav'>
					{/* @ts-ignore see repository note */}
					<Link to='/admin/dashboard' className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Dashboard</Link>
					{/* @ts-ignore */}
					<Link to='/admin/kv' className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Client KV</Link>
					{/* @ts-ignore */}
					<Link to='/admin/settings' className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Server Settings</Link>
					{/* @ts-ignore */}
					<Link to='/admin/ingest' className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Ingest Targets</Link>
					{/* @ts-ignore */}
					<Link to='/admin/tools' className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Tools</Link>
				</nav>
				<div className='sidebar-footer'>
					<div className='signed-in muted'>Signed in as: {userKind}</div>
					<button type='button' onClick={() => logout()}>Logout</button>
				</div>
			</aside>

			<section className='admin-content'>
				<Outlet />
			</section>
		</div>
	);
}
