import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function PreviewMobile() { if (!import.meta.env.DEV) notFound(); return <iframe title="390px 移动界面预览" src="/preview" style={{ width:390, height:844, border:0, display:'block', margin:'20px auto', background:'#f6f7f3' }}/>; }
