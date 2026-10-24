import Dashboard from "./dashboard";
import { getChatGPTUser, chatGPTSignInPath } from "./chatgpt-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return <main className="signin"><div className="brandmark">F<span>↗</span></div><p className="eyebrow">YOUR PRIVATE RESEARCH SPACE</p><h1>让每一次判断，<br/>有据可循。</h1><p>FundLens 私人基金研究工作台。登录后查看自选、持仓与可追溯的研究报告。</p><a className="primary" href={chatGPTSignInPath("/")} target="_top">使用 ChatGPT 账户登录 ↗</a><small>此站点仅向所有者开放。</small></main>;
  return <Dashboard displayName={user.displayName} />;
}
