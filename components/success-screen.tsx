export function SuccessScreen({ username }: { username: string }) {
  return (
    <div className="text-center py-8">
      <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Hello {username}</h2>
    </div>
  )
}

