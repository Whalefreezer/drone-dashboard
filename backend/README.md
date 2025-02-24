## Building

Before building, ensure your frontend files are in the `static` directory. These files will be embedded into the binary during compilation.

To build the server into a single executable:

```bash
go build -o drone-dashboard.exe
```

### Optimized Build (Smaller Binary)

To create a significantly smaller binary, use these optimization flags:

```bash
# Windows
go build -ldflags="-s -w" -trimpath -o drone-dashboard.exe

# Linux/macOS
go build -ldflags="-s -w" -trimpath -o drone-dashboard
```

The optimization flags do the following:
- `-ldflags="-s -w"`: Strips debug information and symbol tables
- `-trimpath`: Removes file system paths from the binary

After building, you can further compress the binary using UPX:
1. Download UPX from https://upx.github.io/
2. Run: `upx --best drone-dashboard.exe`

This can reduce the binary size by up to 50-70% depending on the content.

### Multi-Platform Build Scripts 