# R79.1 imagegen prompt

- Use case：`stylized-concept`
- Asset type：production game start-screen atmosphere master, 16:9 landscape
- Input Image 1：`assets/ui/start.png`，只作 style／palette／texture／world reference，不複製其中車隊、人物、殭屍、告示牌或前景主體。
- Scene：左右側三分之一的遠景廢墟公路與工業剪影、灰燼煙天、稀疏節制餘燼。
- Composition：中央 32% 從上到下必須壓暗、低細節、低對比，供直式 key art 疊放；所有 skyline、碎石、火光、銳利輪廓留在中央以外。
- Palette：coal black、burnt umber、muted rust、dim amber。
- Constraints：無文字、字母、數字、UI、logo、招牌字、浮水印、中央車輛、任何車輛、前景角色、人物、生物、殭屍、中央建物、中央火光或突出告示牌。
- Avoid：中央高頻細節、中央亮光、密集餘燼、近景碎石、lens flare、光滑 3D 或寫實攝影感。

執行路徑：OpenAI built-in imagegen；未使用 CLI、API 或 `OPENAI_API_KEY`。
