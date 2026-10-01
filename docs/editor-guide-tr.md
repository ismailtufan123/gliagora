# Gliagora yönetim paneli: editör rehberi

Bu rehber, Gliagora'ya iş ilanı ekleyen ve gelen önerileri inceleyen editör için yazıldı (M4 sürümü, Ekim 2026). Yönetim paneli İngilizcedir; düğme ve alan adları burada panelde göründükleri gibi, tırnak içinde İngilizce geçer. Panel değiştikçe bu rehber de güncellenir. Rehberi panelin içinde de okuyabilirsiniz: sol menünün en altındaki **"Yardım"** bağlantısı onu açar.

## 1. Giriş

1. Tarayıcıda **https://gliagora.com/admin/** adresini açın.
2. Tarayıcı önce küçük bir pencerede kullanıcı adı ve parola sorar. Bu, sitenin tamamını M2'ye kadar kapalı tutan **site geneli paroladır**: kullanıcı adı `editor`, parolayı teknik yöneticiden alın ve parola yöneticinize kaydedin. Tarayıcı bu parolayı oturum boyunca hatırlar.
3. Ardından Gliagora'nın giriş ekranı gelir: **kendi e-posta adresiniz ve kendi parolanızla** girin. Hesabınızı teknik yönetici açar; ilk girişte parolanızı değiştirin.
4. Aynı hesapla üst üste 5 hatalı denemede hesap 15 dakika kilitlenir. Parola sıfırlama e-postaları M2'de posta kutusu kurulana kadar gelmez; parolanızı unutursanız teknik yöneticiye yazın.

Girişten sonra açılan panonun en üstünde **"Waiting for an editor"** kutusu durur. Bekleyen her iş buradan tek tıkla açılır:

- "Review queue": incelenmeyi bekleyen adaylar ("new" yeni, "triaged" bakılmış ama karar verilmemiş);
- "In review": yayımlanmaya hazırlanan ilanlar;
- "Suggestions waiting": formdan gelen öneriler;
- "Reports": "Report a problem" formundan gelen bildirimler, ve **24 saat içinde yanıtlanması gereken kişilik hakları talepleri** (süresi geçenler kalın yazılır);
- "Data requests to answer within 7 days": 30 günlük yanıt süresi 7 gün içinde dolan açık veri talepleri ("New" ya da "In progress"; süresi geçenler kalın yazılır);
- "Closing within 14 days": son başvuru tarihi yaklaşan yayındaki ilanlar.

## 2. İlan eklemek ve yayımlamak

İlan ya inceleme kuyruğundaki bir adaydan doğar (bölüm 3) ya da doğrudan eklenir: sol menüde **"Jobs" → "Create New"**. Her ilan işverenin **kendi sitesindeki** ilana dayanır; iş ilanı siteleri ve aracı firmalar kaynak değildir.

1. **Kurum ("Institution")**: adını veya ROR kimliğini yazıp seçin. Kurumlar ROR veritabanından gelir ve yeni ROR sürümü çıktığında (ayda bir kadar) kendiliğinden güncellenir. Listede henüz olmayan bir kurumu "Institutions" → "Create New" ile ekleyin: yalnızca ROR kimliğini girip kaydetmeniz yeter (ör. `05dxps055`). ROR'da hiç olmayan bir kurumu koordinatlarıyla elle ekleyin.
2. **Başlık ("Title")**: ilandaki başlığın aynısı, ilanın dilinde. Değiştirmeyin, çevirmeyin.
3. **Yer**: yalnızca iş kurumun şehrinde değilse "Location, if not at the institution" altında şehir ve ülke girin.
4. **Sınıflandırma**: "Position type" (pozisyon türü) ve en az bir "Subfields" (alt alan) zorunludur. "Career stages", "Methods" ve "Model systems" ilanda açıkça geçiyorsa eklenir.
5. **Son başvuru ("Deadline")**:
   - "Fixed date": belirli bir gün. "Deadline day" alanına o günü girin. "Time zone of the deadline" kurumun saat dilimiyle kendiliğinden dolar; ilan başka bir saat dilimi belirtiyorsa onu seçin.
   - "Rolling": başvurular sürekli değerlendiriliyor.
   - "Until filled": pozisyon dolana kadar açık.
6. **"Start"**: başlangıç, ilanda yazdığı gibi (ör. "January 2027").
7. **Özet ("Summary")**: İngilizce, **kendi cümlelerinizle** bir iki cümle, en çok 280 karakter. İlandan cümle kopyalamayın.
8. **"Original posting"**: ilanın işverenin sitesindeki adresi. Okurlar başvurmak için oraya gönderilir.
9. **"Original language"**: ilanın dili.
10. **Kontrol listesi ("Editorial checklist")**: bölüm 4'teki beş kutu. Her birini orijinal sayfada kontrol ettikten sonra işaretleyin.
11. **"Last verified"** (sağ sütun): bilgileri işverenin sayfasında en son kontrol ettiğiniz gün. Sitede ilanın yanında gösterilir.
12. **"Internal notes"**: yalnızca editörler görür, sitede asla çıkmaz.

**Durum ("Status", sağ sütun):**

- "Draft": taslak, her an kaydedilebilir.
- "In review": bütün bilgiler dolu olmalı.
- "Published": bilgiler, kontrol listesinin beş kutusu ve "Last verified" gerekir. Eksik bir şey varsa panel kaydetmez ve eksik alanı kırmızıyla gösterir.
- Yayındaki bir ilanın son başvuru tarihini değiştirdiğinizde, ya da kapanmış bir ilanı yeniden yayımladığınızda, "Last verified" alanına bugünü (ya da kayıtlı günden sonraki bir günü) girmeniz gerekir.

**Çift kayıt uyarısı:** Kaydederken benzer bir ilan varsa panel uyarır ve o ilanın adını verir.

- Gerçekten aynı pozisyonsa bu kaydı yayımlamayın.
- Farklı bir pozisyonsa sağ sütundaki "Not a duplicate" kutusunu işaretleyip yeniden kaydedin.

**Yayından sonra:**

- Son başvuru günü, ilanın saat diliminde bittiğinde ilan bir saat içinde kendiliğinden "Expired" olur.
- Yanlışlıkla yayımlanan ya da işverenin kaldırdığı bir ilanı "Withdrawn" yapın; adresi hemen "kaldırıldı" (410) yanıtı verir.
- Yayımlanmış ilanlar hiç silinmez. Her değişiklik "Versions" sekmesinde saklanır.

## 3. İnceleme kuyruğu

**Adaylar ("Candidates")**: "Suggest a listing" formundan gelen iş önerileri buraya kendiliğinden düşer. Siz de elle aday ekleyebilirsiniz. Her aday için:

1. Orijinal ilanı açın: işverenin kendi sayfasında mı, hâlâ açık mı?
2. "Title as posted" (başlık) ve "Institution" (kurum) alanlarını doldurun. "Possible duplicate jobs" altında benzer ilanlar listelenir.
3. Karar verin ("Status"):
   - **"Accepted"**: bir taslak ilan oluşturur ve "Job created" altında bağlar. Onu açın, bilgileri tamamlayın ve yayımlayın (bölüm 2). Kabul kesindir.
   - **"Rejected"**: bir gerekçe seçin: "Not neuroscience", aracı firma, "Closed, or the deadline has passed", "Not a position", "Not on the employer's own page".
   - **"Duplicate"**: "Duplicate of" alanında aynı pozisyonun ilanını seçin.
   - **"Triaged"**: baktınız ama henüz karar vermediniz. Reddedilen ya da çift kayıt sayılan bir aday yeniden "Triaged" yapılabilir.

   Adaylar hiç silinmez; her kararın kaydıdır. "Decision note" yalnızca editörler içindir.

**Öneriler ("Submissions")**: formdan gelen her öneri.

- İş önerileri kendi adaylarını izler; kararı adayda verirsiniz, öneri kendiliğinden güncellenir.
- Etkinlik, burs, makale gibi diğer türler, ilgili bölümler kurulana kadar "New" olarak bekler. Bunları elle ele alıp "Decided" yapın.
- Öneren kişi izin verdiyse e-posta adresi saklanır ve M2'den sonra kararı kendisine otomatik e-postayla bildirilir. Bildirimde sizin notunuz değil, yalnızca sade gerekçe gider.
- Öneri, e-postası ve notuyla birlikte, karardan 90 gün sonra silinir.

**Bildirimler ("Reports")**: "Report a problem" formundan gelir.

- Durumlar: "New" (henüz kimse bakmadı), "In progress" (kişiye yanıt verdiniz ya da kontrole başladınız), "Closed".
- Kapatmak için "What was done" seçilmelidir: değişiklik gerekmedi, düzeltildi ya da kaldırıldı (ilan "Withdrawn").
- **Kişilik hakları talepleri** (5651 sayılı Kanun m.9) **24 saat içinde** yanıtlanır; panodaki sayaç bunları gösterir.
- Bildirimler kapandıktan 2 yıl sonra silinir.

**Veri talepleri ("Data requests")**: kişilerin kendi kişisel verileriyle ilgili talepleri (KVKK m.11). Sol menüde "Review queue" altındadır.

- privacy@ adresine e-postayla gelen bir talebi burada "Create New" ile kaydedin. "What the person asks for" alanında ne istendiğini seçin. Talebin geldiği adresi ("Email", zorunlu) ve e-postanın posta kutusuna ulaştığı zamanı ("Received") girin. Kaynak ("Source") kendiliğinden "Email (recorded by an editor)" olur. Bu bilgiler kaydedildikten sonra değiştirilemez.
- Durumlar: "New" (henüz yanıtlanmadı), "In progress" (kişiye yanıt verdiniz ya da işe başladınız), "Closed". Talep geri "New" yapılamaz. "Not confirmed yet" yalnızca sitedeki formdan gelen ve kişinin henüz onaylamadığı taleplerdir; bunlara dokunmayın. Site formu henüz kurulmadı (M4b).
- Talepler, geliş tarihinden itibaren **30 gün içinde** yanıtlanır ("Answer by", sağ sütun).
- Bir üye hesabını kendi ayarlarından sildiğinde ("Delete my account"), site bunu kendiliğinden kaydeder: kaynak "Account settings", durum "Closed", yapılan "Deleted automatically". Sizin bir şey yapmanız gerekmez. Hesabın e-posta adresi varsa kişiye silmeyi doğrulayan tek bir e-posta gider ("Confirmation emailed", posta kutusu M2'de kurulunca).
- Kapatmak için "What was done" seçilmelidir: "Answered" (istenen yapıldı), "Refused" (kişiye gerekçesi bildirildi) ya da "Not applicable" (spam, yanlışlık ya da bizdeki verilerle ilgisi yok). "Note on what was done" yalnızca editörler içindir.
- Talepler elle hiç silinmez. Yanlışlıkla açılan bir kaydı "Not applicable" ile kapatın. Kapanan talepler 2 yıl sonra silinir.

## 4. Kontrol listesi: her madde ne anlama gelir?

Yayımlamak için beş kutunun hepsi işaretli olmalı. Her kutuyu **orijinal sayfaya bakarak** işaretleyin; ezbere işaretlemeyin.

1. **"Posted by the employer itself and not by a recruitment agency"**: İlan üniversitenin, enstitünün ya da laboratuvarın kendi sitesinde yayımlanmış. Aracı firma, işe alım ajansı ya da iş ilanı sitesi değil. Gliagora okuru her zaman doğrudan işverene gönderir.
2. **"The original page is reachable and the position is still open"**: "Original posting" bağlantısı açılıyor ve ilan hâlâ başvuru kabul ediyor. Sayfa kaldırılmışsa ya da "kapandı" yazıyorsa yayımlamayın.
3. **"The deadline is confirmed on the original page"**: Son başvuru gününü (ve varsa saatini ya da saat dilimini) işverenin sayfasında gördünüz. "Rolling" ya da "Until filled" seçtiyseniz sayfada da öyle yazıyor. Kontrol ettiğiniz gün "Last verified" olur.
4. **"The summary is in my own words with no copied sentences"**: Özet sizin yazdığınız bir iki cümle, en çok 280 karakter. İlandan kopyalanmış cümle yok; kopyalamak telif sorunu doğurur.
5. **"No personal contact details and no logos or images are copied"**: İlandaki kişilerin e-posta adresi, telefonu gibi bilgiler ve kurum logoları ya da görseller alınmadı. Okur, iletişim bilgilerine işverenin sayfasından ulaşır.

Bu beş kutunun yanında panel şu bilgileri de ister: kurum, başlık, pozisyon türü, en az bir alt alan, son başvuru, özet, orijinal ilan adresi, dil ve "Last verified". Bunlardan biri eksikse ilan yayımlanamaz.

Sorunuz olursa ya da panel beklenmedik bir şey yaparsa ekran görüntüsüyle teknik yöneticiye yazın. Ekran görüntüsünde kişisel veri (öneren kişinin e-postası gibi) varsa önce onu kapatın.
