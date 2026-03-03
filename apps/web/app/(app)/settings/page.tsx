import { UserProfile } from '@clerk/nextjs';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Account Settings</h1>
      <UserProfile />
    </div>
  );
}
