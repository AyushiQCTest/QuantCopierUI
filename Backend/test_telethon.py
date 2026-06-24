import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

async def main():
    client = TelegramClient(StringSession(), 6896618, 'cf2c894e9e19c3bbeb9fcade8d597386')
    print("Connecting...")
    await client.connect()
    print('Connected')
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())
