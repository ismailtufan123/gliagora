# Gliagora yönetim paneli: editör rehberi

Bu rehber, Gliagora'ya iş ilanı ekleyen ve gelen önerileri inceleyen editör için yazıldı (M7 sürümü, Ekim 2026). Yönetim paneli İngilizcedir; düğme ve alan adları burada panelde göründükleri gibi, tırnak içinde İngilizce geçer. Panel değiştikçe bu rehber de güncellenir. Rehberi panelin içinde de okuyabilirsiniz: sol menünün en altındaki **"Yardım"** bağlantısı onu açar.

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
- E-postayla gelen bir **silme** talebinde kişiyi veri talebi formuna yönlendirebilirsiniz: form, gönderdiği bağlantıyla adresin kişiye ait olduğunu kanıtlar ve silmeyi (bir üye hesabı da dâhil) kendisi yapar.
- Durumlar: "New" (henüz yanıtlanmadı), "In progress" (kişiye yanıt verdiniz ya da işe başladınız), "Closed". Talep geri "New" yapılamaz.
- **Sitedeki formdan gelen talepler** (kaynak "Data-request form", sayfa `/en/legal/data-requests/`): form gönderilince site hemen "Not confirmed yet" durumunda küçük bir kayıt açar. Bu kayıtta yalnızca talebin türü, geldiği tarih ve adresten üretilmiş bir kod ("Address code") vardır; adres, ad ve açıklama yoktur. Kişiye bir onay bağlantısı gider (24 saat geçerli). **Onaylanmamış taleplere yanıt vermeyin ve dokunmayın:** kişi bağlantıyla onaylamadıkça hiçbir şey yapılmaz ("Note on what was done" ve "What was done" alanları bu kayıtlarda kilitlidir, bir not eklenemez); bu kayıtlar 60 gün sonra kendiliğinden silinir ve gösterge panelinde sayılmaz.
- Kişi bir **silme** talebini onaylarsa site silmeyi kendisi yapar: bu adresle gönderilen önerileri, bu adrese sahip üye hesabını ve sorun bildirimlerindeki adresi siler (kişilik haklarına ilişkin bildirimler adresi korur). Talep "Closed" ve "Deleted automatically" olur; "What the site deleted" alanında neyin kaç tane silindiği yazar. Sizin bir şey yapmanız gerekmez; kişiye neyin silindiğini bildiren bir e-posta gider ("Confirmation emailed").
- **Diğer talepler** onaylanınca adresi, varsa adı ve açıklamasıyla "New" olarak gelir. Bunları talebin geldiği tarihten (onaylandığı tarihten değil) itibaren **30 gün içinde** yanıtlayın.
- Biri formdan talep gönderdiğini ama bağlantının süresinin dolduğunu yazarsa, kişiden formu yeniden göndermesini isteyin. Eski kaydı bulmak gerekirse teknik yönetici, kişinin verdiği adresten "Address code" değerini hesaplayabilir (`deploy/README.md`, 10. adım).
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

## 5. Kaynaklar ve programın bulduğu adaylar

**Kaynaklar ("Sources")**: ilanların geldiği yerler; sol menüde "Sources" altında. Her kaynağın bir türü ("Kind") vardır:

- **"RSS or Atom feed"**, **"Documented API"**, **"Vacancy list page (plain HTML)"**: bunları sitenin programı ("Gliagora-Monitor") her sabah (Türkiye saatiyle 07:40 civarı) kendisi okur. Yeni ve sinirbilimle ilgili ilanları "New" durumunda aday yapar. Program hiçbir şeyi yayımlamaz.
- **"Checked by an editor"** (elle): programın okumadığı kaynaklar (sayfası yalnızca JavaScript'le açılanlar, bot denetimi olanlar, kullanım koşulları otomatik okumayı yasaklayanlar). Sayfayı "Address" alanından açın, yeni ilanları elle aday olarak ekleyin (adayın "Source" alanında bu kaynağı seçin), sonra kaynağın sağ sütunundaki **"Looked at today"** kutusunu işaretleyip kaydedin. "Schedule" ne sıklıkla bakılacağını söyler; zamanı gelen kaynaklar panoda listelenir.

Program şu kurallarla okur (D52): her kaynağa günde en çok bir kez, bir siteye aynı anda tek istek, her okumadan önce `robots.txt` denetimi, kullanım koşullarına uyma. İş ilanı siteleri (job board) hiçbir zaman kaynak değildir.

Bir kaynağın sağ sütununda programın kaydı durur: son okuma ("Last run", "Last success"), art arda kaç kez başarısız olduğu, son hata, bulduğu aday sayısı. **"Needs attention"** işaretliyse "Why" alanı nedenini söyler:

- **art arda 3 başarısız okuma**: sayfanın adresi değişmiş olabilir. Sayfayı açın; adres değiştiyse "Address" alanını düzeltin, düzelmiyorsa "Monitor on" kutusunu kaldırın ya da türü "Checked by an editor" yapın.
- **`robots.txt` ya da site okumaya izin vermiyor**: program bu kaynağı okumaz. Türünü "Checked by an editor" yapın.
- **kullanım koşulları değişmiş**: "Terms of use" bağlantısını açıp koşulları yeniden okuyun. Otomatik okumayı yasaklıyorsa "Automated access" alanını "forbids" yapın (kaynak elle kontrole geçer). Okuduktan sonra "Terms checked" alanına bugünün tarihini yazıp kaydedin; uyarı kalkar.

Yeni kaynak eklerken: işvereni "Institution" alanında seçin, kullanım koşullarının adresini ve ne dediğini girin. Liste sayfası türünde, ilan adreslerinin kalıbı ("Addresses of postings") gerekir; bunu teknik yönetici yazar. Bir kaynağı geçici olarak durdurmak için "Monitor on" kutusunu kaldırın.

**Programın bulduğu adaylar**: "Candidates" listesinde, "Source" alanı dolu olanlardır. Elle eklenen adaylar gibi ele alınır (bölüm 3), şu farklarla:

- **"Extracted facts"**: programın ilandan okuduğu bilgiler (son başvuru tarihi, yer, yayın tarihi) ve her birinin nereden okunduğu. Bunlar yalnızca başlangıçtır: her birini orijinal ilanda kontrol edin.
- **"Source text"**: ilanın metni; kişi adları, e-posta adresleri ve telefon numaraları "[name]", "[email]", "[phone]" ile değiştirilmiş olarak. Sitede hiç görünmez ve karardan 30 gün sonra silinir. Kural tabanlıdır; bir ad gözden kaçabilir.
- **"Suggested tags"**: başlıkta ve metinde geçen sözcüklere göre önerilen alt alan, yöntem, model sistem, pozisyon türü ve kariyer aşaması (yapay zekâ değil, sözcük eşleştirme). Aday kabul edilince taslak ilan bunlarla ve programın okuduğu son başvuru tarihiyle başlar; ilanda kontrol edip düzeltin.
- Program, son başvuru tarihi geçmiş, sinirbilimle ilgisiz görünen ya da zaten aday veya ilan olarak kayıtlı ilanları aday yapmaz. Neden aday yapılmadığını **"Postings seen"** listesinde görebilirsiniz ("Outcome"). Sinirbilimle ilgisiz sayılmış ama ilgili bir ilan görürseniz elle aday olarak ekleyin.

**Panodaki "Sources" kutusu** ("Waiting for an editor" kutusunun altında):

- **"New candidates from sources"**: kaynaklardan gelen ve henüz bakılmamış ("New") adaylar, kaynağa göre.
- **"Sources that need attention"**: dikkat gerektiren kaynaklar ve nedenleri (yukarıya bakın).
- **"Manual sources due for a look"**: zamanı gelmiş elle kontrol edilecek kaynaklar. "open the page" sayfayı açar; baktıktan sonra kaynakta "Looked at today" kutusunu işaretleyin.
- **"Weekly link check of published jobs"**: program her pazar, yayımlanmış her ilanın orijinal sayfasını açar. Sayfa kalkmışsa ("Page gone"), yanıt vermiyorsa ("Page not answering") ya da pozisyonun dolduğunu veya kapandığını yazıyorsa ("Page says the position is filled or closed"), ilan bu listeye girer. **Hiçbir ilan kendiliğinden kapanmaz.** İlanı ve orijinal sayfayı açın: pozisyon gerçekten kapandıysa ilanı "Withdrawn" ya da süresi dolmuş olarak kapatın; uyarı yanlışsa ilanın sağ sütunundaki **"The link check's warning is wrong"** kutusunu işaretleyip kaydedin (bir sonraki kontrol başka bir şey bulursa ilan yeniden listeye girer). Kontrolün ne bulduğu ilanın sağ sütununda, "Link check found" alanında yazar.

**İlk kaynaklar**: CSV'deki 70 işveren ve alt birimleri, toplam 118 kaynak, 2026-10-16'da resmî sitelerinden incelenip eklendi. Her kaynağın "Notes" alanında incelemenin notları (platform, ilanlardaki son başvuru biçimi, `robots.txt`), elle kontrol edilenlerde nedeni yazar. İşverenin kurumu ROR kimliğiyle bağlandı; bağlanamadıysa notlarda ROR kimliği yazar, "Institution" alanından seçin.

## 6. Yapay zekâ taslakları ("AI draft")

Bazı adaylarda **"AI draft"** alanı doludur: Claude'un (Anthropic) adayın kişi adları, e-posta adresleri ve telefon numaraları çıkarılmış başlığından ve metninden yazdığı bir taslak (D52). Taslakta kendi sözlerimizle en çok 280 karakterlik bir özet ("summary"), pozisyon türü, son başvuru tarihi ve saat dilimi, yer, alt alanlar ve kariyer aşaması bulunur; her biri neye dayandığını söyler ("from"). Taslak sitede hiçbir zaman görünmez.

- Taslaklar şimdilik **haftada bir** gelir: teknik yönetici Claude Code'a "Do the weekly drafts" der; Claude Code bekleyen adayları sunucudan dışa aktarır, taslakları yazar ve geri yükler. İleride Claude API ile her gün de gelebilir (bir anahtar ve aylık harcama sınırı girilene kadar kapalıdır).
- Adayı kabul ettiğinizde ("Accepted"), **"Start the job from the AI draft"** işaretliyse taslak ilan özetini, pozisyon türünü, son başvuru tarihini, alt alanları ve kariyer aşamasını taslaktan alır ve "Drafted with AI assistance" işaretlenir. Taslağı kullanmak istemiyorsanız kabul etmeden önce bu kutuyu kaldırın.
- **Her bilgiyi orijinal ilanda kontrol edin**, özeti gerekirse yeniden yazın: yayımlanan metnin sorumluluğu sizdedir. Taslak bir kişi adı içeriyorsa ya da notunda "A name was left in the source text" yazıyorsa adı yayımlamayın ve teknik yöneticiye bildirin.
