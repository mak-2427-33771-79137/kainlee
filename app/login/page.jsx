import { redirect } from 'next/navigation';
import Frame from '@/components/Frame';
import LoginForm from './LoginForm';
import { db } from '@/lib/db';
import { getAdmin } from '@/lib/auth';
import { regimentName } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Organiser login' };

export default async function Login() {
  if (await getAdmin()) redirect('/admin');
  const k = await db();
  const n = Number((await k('users').count({ n: '*' }).first()).n);
  return (
    <Frame>
      <main style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 16px' }}>
        <LoginForm needsSetup={n === 0} regiment={await regimentName()} />
      </main>
    </Frame>
  );
}
