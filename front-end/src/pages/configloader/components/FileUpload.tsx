import React from 'react';

interface FileUploadProps {
    onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const FileUpload = ({ onFileUpload }: FileUploadProps) => {
    return (
        <div className="mb-4">
            <label className="form-label">Configuration File</label>
            <input
                type="file"
                accept=".yaml,.yml"
                onChange={onFileUpload}
            />
        </div>
    );
};
