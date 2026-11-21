# Security Specification — Chess Lab Firestore

## 1. Data Invariants
1. **Zero PII in Firestore**: Neither `/users/{userId}`, `/leaderboard/{userId}`, nor `/variants/{variantId}` stores emails, phone numbers, addresses, or OAuth tokens.
2. **Identity Binding**: Every created/updated profile, leaderboard card, variant, rating, comment, and game record must strictly bind its owner/author UID (`uid`, `creatorUid`, `raterUid`, `authorUid`, `playerUid`) to `request.auth.uid`, with `request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `createdAt` must equal `request.time` on creation and never change on update; `updatedAt` must equal `request.time` on both creation and update. Owner UIDs are immutable after creation.
4. **Visibility Isolation**: `private` variants are readable only by `creatorUid == request.auth.uid`. `link` variants are readable via direct `get` (with ID) or by owner, and NEVER returned in public `list` queries (`resource.data.visibility == 'public' || (isSignedIn() && resource.data.creatorUid == request.auth.uid)`).
5. **Master Gate on Subcollections**:
   - `/variants/{variantId}/comments/{commentId}` cannot be created unless parent variant exists, has `visibility in ['public', 'link']`, and has `commentsEnabled == true`.
   - `/variants/{variantId}/ratings/{raterUid}` requires `raterUid == request.auth.uid`, valid parent variant in `['public', 'link']`, and atomic update of parent `ratingSum` / `ratingCount` (`getAfter`).
6. **Terminal Game History**: `/users/{userId}/games/{gameId}` is append-only (`update` denied) so past results cannot be tampered with.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Identity Spoofing on User Profile**: Authenticated User A attempts `setDoc(doc(db, 'users', 'userB'), { uid: 'userB', ... })` -> Denied (`userId == request.auth.uid` fails).
2. **UID Field Mismatch**: User A creates `/users/userA` with `{ uid: 'userB', ... }` -> Denied (`incoming().uid == request.auth.uid` fails).
3. **Shadow / Ghost Field Injection**: User A creates `/variants/var1` with `{ ..., isAdmin: true }` -> Denied (`data.keys().hasOnly([...])` rejects).
4. **Unverified Email Write**: Authenticated user with `email_verified: false` tries to create a variant -> Denied (`isVerifiedUser()` fails).
5. **Client Timestamp Forgery**: User A creates `/variants/var1` with `createdAt: Timestamp(1999-01-01)` instead of `serverTimestamp()` -> Denied (`incoming().createdAt == request.time` fails).
6. **Private Variant Scraping (`list`)**: User B runs `getDocs(collection(db, 'variants'))` without filtering `visibility == 'public'` -> Denied (`allow list` requires `resource.data.visibility == 'public' || resource.data.creatorUid == request.auth.uid`).
7. **Link-Only Variant Scraping (`list`)**: User B tries to list `visibility == 'link'` variants -> Denied (`allow list` excludes `'link'` for non-owners).
8. **Variant Ownership Hijack (`update`)**: User B updates User A's variant rules -> Denied (`existing().creatorUid == request.auth.uid` fails).
9. **Popularity Inflation Attack**: User B updates `games` from `10` to `9999` on User A's variant -> Denied (`incoming().games == existing().games + 1` fails).
10. **Disabled Comments Bypass**: User B writes a comment to `/variants/var_no_comments/comments/c1` where parent `commentsEnabled == false` -> Denied (Master Gate `get()` fails).
11. **Non-Atomic Rating Tampering**: User B writes `/variants/var1` `ratingCount: 100` without atomically writing `/variants/var1/ratings/userB` -> Denied (`existsAfter` / `getAfter` fails).
12. **Resource Poisoning (1MB ID/String)**: User A tries `/variants/` + `'a'.repeat(500)` or `description: 'x'.repeat(5000)` -> Denied (`isValidId` `<= 128` and `description.size() <= 600` fail).
