import ProfileClient from "./ProfileClient";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return <ProfileClient profileId={id} />;
}
