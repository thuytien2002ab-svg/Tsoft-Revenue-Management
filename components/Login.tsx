import React, { useState } from 'react';

interface LoginProps {
  onLogin: (username: string, password: string) => Promise<{ success: boolean, message?: string }>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('1');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = await onLogin(username, password);
    if (!result.success) {
      setError(result.message || 'Đã có lỗi xảy ra.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-slate-800 rounded-lg shadow-lg shadow-slate-700/50">
        <div className="flex flex-col items-center">
          <div className="relative font-black tracking-tighter uppercase text-6xl inline-block select-none">
            {/* Lớp nền chữ tĩnh luôn hiển thị rõ ràng 100% */}
            <h1>
              <span className="text-red-600">TIFO</span> <span className="text-black">MEDIA</span>
            </h1>
            {/* Lớp ánh sáng lướt qua trên chữ */}
            <h1 className="absolute top-0 left-0 w-full h-full shine-layer pointer-events-none" aria-hidden="true">
              TIFO MEDIA
            </h1>
          </div>
          <h2 className="mt-4 text-2xl font-bold text-center text-slate-300">Đăng nhập hệ thống</h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="relative block w-full px-4 py-3 text-lg bg-slate-700 text-white placeholder-slate-400 border border-slate-600 rounded-none appearance-none rounded-t-md focus:outline-none focus:ring-primary-focus focus:border-primary-focus focus:z-10"
                placeholder="Tên đăng nhập"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="relative block w-full px-4 py-3 text-lg bg-slate-700 text-white placeholder-slate-400 border border-slate-600 rounded-none appearance-none rounded-b-md focus:outline-none focus:ring-primary-focus focus:border-primary-focus focus:z-10"
                placeholder="Mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-center text-red-400">{error}</p>}

          <div>
            <button
              type="submit"
              className="relative flex justify-center w-full px-4 py-3 text-lg font-medium text-white border border-transparent rounded-md group bg-primary hover:bg-primary-focus focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-focus"
            >
              Đăng nhập
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Login;