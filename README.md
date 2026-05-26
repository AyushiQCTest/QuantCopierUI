# QuantCopierTelegramUI


To isntall the dependencies for nextJS run
```
npm install
```

To run only the NextJS UI app, run
```
npm run next:dev
```

To run the rendered tauri app along with the backend server sidecar (`QuantCopierAPI.exe` file), run
```
npm run tauri dev
```
To generate the sidecar executable, you have to clone the private [telegram-backend-repo](https://github.com/diliprk/telegram-backend/tree/main) and run the `generate_sidecar.sh` script in the root dir of the repo.

To build the tauri application (.exe and .msi setup files)
```
npm run tauri build
```


### Starting Fresh
Remove existing node modules and other files using `Git-bash`
```bash
rm -rf node_modules out .next package-lock.json src-tauri/Cargo.lock src-tauri/config.ini src-tauri/*.log src-tauri/signals.json src-tauri/target/symbol_mapper.json src-tauri/symbol_mapper.json src-tauri/signals.json src-tauri/data src-tauri/static src-tauri/target src-tauri/binaries
```

In the above bash command remove `src-tauri/binaries` to avoid regenerating the python sidecars