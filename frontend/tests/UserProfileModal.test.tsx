import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UserProfileModal } from '../src/components/Modal/UserProfileModal';
import * as client from '../src/api/client';

vi.mock('../src/api/client', () => ({
  fetchUserProfile: vi.fn(),
  saveUserProfile: vi.fn(),
  deleteUserProfile: vi.fn(),
}));

describe('UserProfileModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <UserProfileModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders modal and loads existing profile when isOpen is true', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: true,
      content: 'Name: Max Mustermann\nIBAN: DE12345678901234567890',
      updated_at: '2026-10-20T10:00:00Z',
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/stammdaten \/ profil-notizen/i)).toBeInTheDocument();

    await waitFor(() => {
      const textarea = screen.getByLabelText(/stammdaten notizzettel/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Max Mustermann');
    });
  });

  it('renders default template when profile does not exist', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: false,
      content: '',
      updated_at: null,
    });

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      const textarea = screen.getByLabelText(/stammdaten notizzettel/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('# Stammdaten / Nutzerprofil Notizzettel');
      expect(textarea.value).toContain('IBAN:');
    });
  });

  it('saves updated profile and notifies parent', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: true,
      content: 'Initial Content',
      updated_at: '2026-10-20T10:00:00Z',
    });
    vi.mocked(client.saveUserProfile).mockResolvedValueOnce({
      status: 'success',
      updated_at: '2026-10-20T10:05:00Z',
    });

    const onProfileUpdated = vi.fn();
    render(
      <UserProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onProfileUpdated={onProfileUpdated}
      />
    );

    await waitFor(() => {
      const textarea = screen.getByLabelText(/stammdaten notizzettel/i);
      expect(textarea).toHaveValue('Initial Content');
    });

    const textarea = screen.getByLabelText(/stammdaten notizzettel/i);
    fireEvent.change(textarea, { target: { value: 'Updated Content Profile' } });

    const saveBtn = screen.getByRole('button', { name: /\[SPEICHERN\]/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(client.saveUserProfile).toHaveBeenCalledWith('Updated Content Profile');
      expect(onProfileUpdated).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/erfolgreich gespeichert/i)).toBeInTheDocument();
    });
  });

  it('deletes profile after user confirmation', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: true,
      content: 'Content to be deleted',
      updated_at: '2026-10-20T10:00:00Z',
    });
    vi.mocked(client.deleteUserProfile).mockResolvedValueOnce({
      status: 'success',
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const onProfileUpdated = vi.fn();
    render(
      <UserProfileModal
        isOpen={true}
        onClose={vi.fn()}
        onProfileUpdated={onProfileUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/stammdaten notizzettel/i)).toHaveValue('Content to be deleted');
    });

    const deleteBtn = screen.getByRole('button', { name: /\[PROFIL LÖSCHEN\]/i });
    fireEvent.click(deleteBtn);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() => {
      expect(client.deleteUserProfile).toHaveBeenCalledTimes(1);
      expect(onProfileUpdated).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/profil gelöscht/i)).toBeInTheDocument();
      // Should reset to template
      const textarea = screen.getByLabelText(/stammdaten notizzettel/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('# Stammdaten');
    });

    confirmSpy.mockRestore();
  });

  it('imports text file via FileReader', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: false,
      content: '',
      updated_at: null,
    });

    const { container } = render(
      <UserProfileModal isOpen={true} onClose={vi.fn()} />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    const file = new File(['Imported: Max Tester\nIBAN: DE9999'], 'profile.txt', {
      type: 'text/plain',
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const textarea = screen.getByLabelText(/stammdaten notizzettel/i) as HTMLTextAreaElement;
      expect(textarea.value).toContain('Imported: Max Tester');
      expect(screen.getByText(/erfolgreich importiert/i)).toBeInTheDocument();
    });
  });

  it('rejects file import if file exceeds 64 KB', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: false,
      content: '',
      updated_at: null,
    });

    const { container } = render(
      <UserProfileModal isOpen={true} onClose={vi.fn()} />
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const bigFile = new File(['A'], 'huge.txt', { type: 'text/plain' });
    Object.defineProperty(bigFile, 'size', { value: 70000 });

    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByText(/zu groß.*max\. 64 KB/i)).toBeInTheDocument();
    });
  });

  it('exports profile as text blob', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: true,
      content: 'Export Content Test',
      updated_at: '2026-10-20T10:00:00Z',
    });

    const createObjectURLSpy = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    const revokeObjectURLSpy = vi.fn();
    window.URL.createObjectURL = createObjectURLSpy;
    window.URL.revokeObjectURL = revokeObjectURLSpy;

    // Prevent jsdom navigation warning on anchor click
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    render(<UserProfileModal isOpen={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/stammdaten notizzettel/i)).toHaveValue('Export Content Test');
    });

    const exportBtn = screen.getByRole('button', { name: /\[TXT EXPORTIEREN\]/i });
    fireEvent.click(exportBtn);

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
    expect(screen.getByText(/als 'user_profile\.txt' exportiert/i)).toBeInTheDocument();

    clickSpy.mockRestore();
  });

  it('calls onClose when clicking close button or pressing Escape', async () => {
    vi.mocked(client.fetchUserProfile).mockResolvedValueOnce({
      exists: false,
      content: '',
      updated_at: null,
    });

    const onClose = vi.fn();
    render(<UserProfileModal isOpen={true} onClose={onClose} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/stammdaten notizzettel/i)).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /schließen/i });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
