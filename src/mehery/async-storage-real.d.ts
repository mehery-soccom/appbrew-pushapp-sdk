declare module 'async-storage-real' {
  import type { AsyncStorage } from '@react-native-async-storage/async-storage'

  export const createAsyncStorage: (
    databaseName: string
  ) => AsyncStorage
  export class AsyncStorageError extends Error {}
  const storage: AsyncStorage
  export default storage
}
