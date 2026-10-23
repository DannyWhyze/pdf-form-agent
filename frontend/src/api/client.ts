import {
  DocumentUploadResponse,
  FormFieldsResponse,
  FormFillResponse,
  ModelsResponse,
  UserProfileDeleteResponse,
  UserProfileResponse,
  UserProfileSaveResponse,
} from '../types';

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch('/health');
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkSTTHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/stt-health');
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.online);
  } catch {
    return false;
  }
}

export async function checkTTSHealth(): Promise<boolean> {
  try {
    const res = await fetch('/api/v1/tts-health');
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data.online);
  } catch {
    return false;
  }
}

export async function fetchAvailableModels(): Promise<ModelsResponse> {
  const res = await fetch('/api/v1/models');
  if (!res.ok) {
    throw new Error(`Failed to fetch models: ${res.status}`);
  }
  return res.json();
}

export async function uploadDocument(file: File, threadId: string): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('thread_id', threadId);

  const res = await fetch('/api/v1/upload-document', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Upload failed (${res.status}): ${errText}`);
  }

  return res.json();
}

export function getPdfPreviewUrl(
  threadId: string,
  filename: string,
  version: number,
  page?: number
): string {
  const base = `/api/v1/download/${encodeURIComponent(threadId)}/${encodeURIComponent(filename)}?download=false&v=${version}`;
  return page && page > 1 ? `${base}#page=${page}&view=FitH` : `${base}#view=FitH`;
}

export function getPdfDownloadUrl(threadId: string, filename: string): string {
  return `/api/v1/download/${encodeURIComponent(threadId)}/${encodeURIComponent(filename)}?download=true`;
}

export async function fetchUserProfile(): Promise<UserProfileResponse> {
  const res = await fetch('/api/v1/user-profile');
  if (!res.ok) {
    throw new Error(`Failed to fetch user profile: ${res.status}`);
  }
  return res.json();
}

export async function saveUserProfile(content: string): Promise<UserProfileSaveResponse> {
  const res = await fetch('/api/v1/user-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to save user profile (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function deleteUserProfile(): Promise<UserProfileDeleteResponse> {
  const res = await fetch('/api/v1/user-profile', {
    method: 'DELETE',
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to delete user profile (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function fetchFormFields(threadId: string, filename: string): Promise<FormFieldsResponse> {
  const res = await fetch(`/api/v1/forms/${encodeURIComponent(threadId)}/${encodeURIComponent(filename)}/fields`);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch form fields (${res.status}): ${errText}`);
  }
  return res.json();
}

export async function fillFormDirect(
  threadId: string,
  filename: string,
  fieldValues: Record<string, unknown>
): Promise<FormFillResponse> {
  const res = await fetch(`/api/v1/forms/${encodeURIComponent(threadId)}/fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, field_values: fieldValues }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fill form (${res.status}): ${errText}`);
  }
  return res.json();
}
