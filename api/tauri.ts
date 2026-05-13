import { exit } from '@tauri-apps/plugin-process';

export const handleExit = async () => {
        await exit(1);
}
