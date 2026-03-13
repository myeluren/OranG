import Link from 'next/link'

export default function RegisterSuccessPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--color-bg-base)] to-[var(--color-primary)]/10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)]" />

      <div className="w-full max-w-md px-4">
        <div className="bg-[var(--color-bg-surface)] rounded-2xl shadow-xl p-8 text-center relative z-10">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-4">
            注册申请已提交！
          </h1>

          <p className="text-[var(--color-text-secondary)] mb-6">
            账号待管理员审批，审批通过后可登录使用。
          </p>

          <Link href="/login" className="btn-primary block">
            返回登录页
          </Link>
        </div>
      </div>
    </div>
  )
}
