import asyncio
import httpx

async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp1 = await client.post(
            "http://localhost:8080/cloudflare",
            json={
                "domain": "https://olamovies.watch/generate",
                "mode": "iuam",
            },
        )
        print(resp1.json())

        resp2 = await client.post(
            "http://localhost:8080/cloudflare",
            json={
                "domain": "https://lksfy.com/",
                "siteKey": "0x4AAAAAAA49NnPZwQijgRoi",
                "mode": "turnstile",
            },
        )
        print(resp2.json())

if __name__ == "__main__":
    asyncio.run(main())
