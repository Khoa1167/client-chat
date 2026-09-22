import { useState } from 'react';
import { toast } from '../components/common/toastStore';

// Chọn ảnh (preview qua object URL) rồi upload — dùng chung cho avatar/cover trong SettingsPage.
export default function useImageUpload({ initial = '', uploadFn, formField, onSuccess, errorMessage }) {
  const [preview, setPreview] = useState(initial);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSelect = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setFile(f);
  };

  const onUpload = async () => {
    if (!file) return null;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append(formField, file);
      const data = await uploadFn(formData);
      onSuccess(data);
      setFile(null);
      return data;
    } catch (err) {
      toast.error(err.response?.data?.message || errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const reset = (url = '') => {
    setFile(null);
    setPreview(prev => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return url;
    });
  };

  return { preview, file, loading, onSelect, onUpload, reset, setLoading };
}
