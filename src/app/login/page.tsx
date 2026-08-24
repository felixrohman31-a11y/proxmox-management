import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/lib/session';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  if (getSessionFromCookies()) redirect('/dashboard');
  return (
    <main
      className="grid min-h-screen place-items-center px-4 py-10"
      style={{
        backgroundImage:
          'radial-gradient(circle at 25% 15%, rgba(234,88,12,0.14), transparent 45%), radial-gradient(circle at 78% 72%, rgba(56,189,248,0.10), transparent 42%)'
      }}
    >
      <LoginForm />
    </main>
  );
}
