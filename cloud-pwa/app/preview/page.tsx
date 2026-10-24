import { notFound } from 'next/navigation';
import Dashboard from '../dashboard';
export const dynamic = 'force-dynamic';
export default function Preview() { if (!import.meta.env.DEV) notFound(); return <Dashboard displayName="界面预览" preview/>; }
