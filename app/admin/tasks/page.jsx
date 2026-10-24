import { pageUser } from '@/lib/page';
import MyTasks from '@/components/tasks/MyTasks';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My tasks' };

export default async function MyTasksPage() {
  await pageUser();
  return (
    <>
      <div className="top"><div style={{ flex: 1 }}><div className="lbl">All events</div><h1>My tasks</h1></div></div>
      <MyTasks />
    </>
  );
}
