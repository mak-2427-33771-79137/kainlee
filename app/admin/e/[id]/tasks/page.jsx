import { pageUser, pageEvent } from '@/lib/page';
import Board from '@/components/tasks/Board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tasks' };

// Everyone logged in can see the board; "Manage tasks" can create, edit, assign and delete.
export default async function Tasks({ params }) {
  await pageUser();
  const ev = await pageEvent(params);
  return <Board eventId={ev.id} evName={ev.name} />;
}
