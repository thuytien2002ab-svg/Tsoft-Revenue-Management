import React, { useState } from 'react';
import * as api from '../services/api';
import { User } from '../types';

interface ChangePasswordModalProps {
    user: User;
    onClose: () => void;
    onSuccess: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ user, onClose, onSuccess }) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
            return;
        }

        if (newPassword.length < 1) {
            setError('Vui lòng nhập mật khẩu mới.');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await api.changePassword(user.id, currentPassword, newPassword);
            if (result.success) {
                onSuccess(); // Close and show success message
            } else {
                setError(result.message || 'Đã có lỗi xảy ra.');
            }
        } catch (err) {
            setError('Lỗi kết nối đến máy chủ.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="mb-6 text-2xl font-bold text-white">Đổi mật khẩu</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block mb-1 text-sm font-medium text-slate-300">Mật khẩu hiện tại</label>
                        <input
                            type="password"
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-primary-focus focus:border-primary-focus"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1 text-sm font-medium text-slate-300">Mật khẩu mới</label>
                        <input
                            type="password"
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-primary-focus focus:border-primary-focus"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block mb-1 text-sm font-medium text-slate-300">Nhập lại mật khẩu mới</label>
                        <input
                            type="password"
                            className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:ring-primary-focus focus:border-primary-focus"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    {error && <p className="text-sm text-red-400">{error}</p>}

                    <div className="flex justify-end gap-3 mt-8">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 font-medium text-slate-300 bg-slate-700 rounded-lg hover:bg-slate-600 transition-colors"
                        >
                            Huỷ
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2 font-medium text-white bg-primary rounded-lg hover:bg-primary-focus transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? 'Đang đổi...' : 'Đổi mật khẩu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordModal;
