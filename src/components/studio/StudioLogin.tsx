import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { ApiError, login, type AdminSession } from "@/lib/api";

export default function StudioLogin({
  onLogin,
}: {
  onLogin: (session: AdminSession) => void;
}) {
  const [username, setUsername] = useState("sails");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const session = await login(username.trim(), password);
      onLogin(session);
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "登录服务暂时不可用，请稍后再试。",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="studio-login-shell">
      <section className="studio-login-panel">
        <p className="studio-kicker">StarsailsClover / Writing Room</p>
        <h1>回到雾中的写作台。</h1>
        <p className="studio-login-lead">
          文章、草稿与发布状态会安全地保存在山谷服务器中。
        </p>

        <form onSubmit={submit} className="studio-login-form">
          <label>
            <span>账号</span>
            <input
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              spellCheck={false}
              required
            />
          </label>
          <label>
            <span>密码</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="studio-form-error">{error}</p>}
          <button type="submit" className="studio-primary-action" disabled={pending}>
            {pending ? <LoaderCircle size={17} className="spin" /> : <LockKeyhole size={17} />}
            <span>{pending ? "正在进入" : "进入写作室"}</span>
            {!pending && <ArrowRight size={16} />}
          </button>
        </form>

        <a className="studio-public-link" href="https://sails.oxygenai.top">
          返回飞流星墅
        </a>
      </section>
      <aside className="studio-login-atmosphere" aria-hidden="true">
        <div className="studio-login-still">
          <span>Quiet drafts</span>
          <strong>未完成的心绪，<br />也值得被妥善保存。</strong>
        </div>
      </aside>
    </main>
  );
}
