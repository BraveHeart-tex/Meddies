Row card for a scheduled dose on Today.

```jsx
<DoseCard time="09:00" name="Vitamin D3" detail="1000 IU · 1 tablet" status="taken" statusTime="09:12" />
<DoseCard time="14:00" name="Magnesium" detail="200 mg · 1 tablet" status="notLogged" onClick={open} />
<DoseCard time="20:00" name="Omega-3" detail="1000 mg · 1 capsule" />
```
notLogged gets a blush border so it reads as "needs a response" without alarm.
