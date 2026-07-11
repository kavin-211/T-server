# Fix plan tracking (Puzzle Master - T-server)

## Step 1: Fix virtual-delete bug in backend
- [x] Update `routes/auth.js` to correctly validate allowed mailIDs using `VIRTUAL_DELETE_ALLOWED_MAILS.has(targetEmail)`.


## Step 2: Add deviceId + UA audit logging
- [x] Update `client/script.js` to generate `deviceId` (localStorage) and include it in login payload.

- [x] Update `routes/auth.js` to store deviceId/UA in login/logout history records.


## Step 3: Document every user action in users.json history
- [x] Update `routes/users.js` to push history records for:
  - player create
  - player rename
  - player delete
  - player install
  - level complete/progress
  - (optional) user install

## Step 4: Verify
- [ ] Run server locally and test:
  - login
  - create player
  - complete level
  - admin login/dashboard visibility
  - confirm `data/users.json` receives action records with device meta.

