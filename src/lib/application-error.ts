// Runtime-neutral vocabulary shared by the app, contracts and Worker.
export class ApplicationError extends Error {
  constructor(
    public code: 'validation' | 'unauthorized' | 'unavailable' | 'conflict',
    public status: number,
  ) {
    super(code)
  }
}
