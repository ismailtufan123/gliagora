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
   - **"Accepted"**: bir taslak ilan oluşturur ve "Job created" altında bağlar. Altındaki **"Open the draft job"** düğmesiyle açın, bilgileri tamamlayın ve yayımlayın (bölüm 2). Kabul kesindir.
   - **"Rejected"**: bir gerekçe seçin: "Not neuroscience", aracı firma, "Closed, or the deadline has passed", "Not a position", "Not on the employer's own page".
   - **"Duplicate"**: "Duplicate of" alanında aynı pozisyonun ilanını seçin.
   - **"Triaged"**: baktınız ama henüz karar vermediniz. Reddedilen ya da çift kayıt sayılan bir aday yeniden "Triaged" yapılabilir.

   Adaylar hiç silinmez; her kararın kaydıdır. "Decision note" yalnızca editörler içindir.

**Birkaç adayı birden reddetmek**: "Candidates" listesinde önce süzün ("Filters": örneğin "Source" ya da "Status" "New"), sonra reddedeceğiniz adayların solundaki kutuları işaretleyin (başlık satırındaki kutu sayfadakilerin hepsini seçer). Listenin üstündeki **"Edit"** düğmesine basın. Açılan pencerede "Select fields to edit" alanından **"Status"** seçip "Rejected" yapın; aynı alandan **"Reason"** ekleyip gerekçeyi seçin (örneğin "Not neuroscience"); sonra "Save". Gerekçesiz reddetme kaydedilmez; "Other" seçerseniz "Decision note" da gerekir. Kabul ("Accepted") topluca yapılamaz: adaylar tek tek kabul edilir. Seçime zaten reddedilmiş ya da çift kayıt sayılmış bir aday girerse yalnızca o kaydedilmez (önce "Triaged" yapılması gerekir). Toplu düzenleme yalnızca karar alanlarını, kurumu ve kaynağı değiştirir; ilanın adresi, başlığı ve metni her adayda ayrı kalır. Reddedilen adayların gerekçeleri kaynağa göre sayılır ve kaynakları iyileştirmek için kullanılır; bu yüzden gerekçeyi doğru seçin.

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

- **"RSS or Atom feed"**, **"Documented API"**, **"Vacancy list page (plain HTML)"**, **"Sitemap of posting pages (XML)"**: bunları sitenin programı ("Gliagora-Monitor") her sabah (Türkiye saatiyle 07:40 civarı) kendisi okur. Site haritası ("sitemap"), sitenin `robots.txt` dosyasında adını verdiği ilan sayfaları listesidir: listesi JavaScript isteyen Workday kariyer siteleri (Janelia, CSHL, McGill, EMBL) ve DZNE ile Helmholtz Munich böyle okunur. Yeni ve sinirbilimle ilgili ilanları "New" durumunda aday yapar. Program hiçbir şeyi yayımlamaz.
- **"Checked by an editor"** (elle): programın okumadığı kaynaklar (sayfası yalnızca JavaScript'le açılanlar, bot denetimi olanlar, kullanım koşulları otomatik okumayı yasaklayanlar). Sayfayı "Address" alanından açın, yeni ilanları elle aday olarak ekleyin (adayın "Source" alanında bu kaynağı seçin), sonra kaynağın sağ sütunundaki **"Looked at today"** kutusunu işaretleyip kaydedin. "Schedule" ne sıklıkla bakılacağını söyler; zamanı gelen kaynaklar panoda listelenir.

Program şu kurallarla okur (D52): her kaynağa günde en çok bir kez, bir siteye aynı anda tek istek, her okumadan önce `robots.txt` denetimi, kullanım koşullarına uyma. İş ilanı siteleri (job board) hiçbir zaman kaynak değildir.

Bir kaynağın sağ sütununda programın kaydı durur: son okuma ("Last run", "Last success"), art arda kaç kez başarısız olduğu, son hata, bulduğu aday sayısı. **"Needs attention"** işaretliyse "Why" alanı nedenini söyler:

- **art arda 3 başarısız okuma**: sayfanın adresi değişmiş olabilir. Sayfayı açın; adres değiştiyse "Address" alanını düzeltin, düzelmiyorsa "Monitor on" kutusunu kaldırın ya da türü "Checked by an editor" yapın.
- **`robots.txt` ya da site okumaya izin vermiyor**: program bu kaynağı okumaz. Türünü "Checked by an editor" yapın.
- **kullanım koşulları değişmiş**: "Terms of use" bağlantısını açıp koşulları yeniden okuyun. Otomatik okumayı yasaklıyorsa "Automated access" alanını "forbids" yapın (kaynak elle kontrole geçer). Okuduktan sonra "Terms checked" alanına bugünün tarihini yazıp kaydedin; uyarı kalkar.

Yeni kaynak eklerken: işvereni "Institution" alanında seçin, kullanım koşullarının adresini ve ne dediğini girin. Liste sayfası ve site haritası türünde, ilan adreslerinin kalıbı ("Addresses of postings") gerekir; bunu teknik yönetici yazar. Bağlantıları adres yerine bir kimlik numarası taşıyan listelerde (Oxford'un `javascript:viewTheJobSpec('…')` bağlantıları) kalıp yerine **"IDs in the list's links"** ve **"Address of a posting from its ID"** alanları kullanılır; bunları da teknik yönetici yazar. Bir kaynağı geçici olarak durdurmak için "Monitor on" kutusunu kaldırın.

**Programın bulduğu adaylar**: "Candidates" listesinde, "Source" alanı dolu olanlardır. Elle eklenen adaylar gibi ele alınır (bölüm 3), şu farklarla:

- **"In plain words"** kutusu (adayın sayfasında, "Source text" altında): aşağıdaki üç alanı (programın okuduğu bilgiler, önerilen etiketler, yapay zekâ taslağı) düz sözlerle ve her bilginin nereden geldiğiyle gösterir; etiketler adlarıyla yazılır. Aynı bilgiler JSON olarak **"The same as data (JSON)"** başlığının altında kapalı durur; teknik yönetici içindir.

- **"Extracted facts"**: programın ilandan okuduğu bilgiler (son başvuru tarihi, yer, yayın tarihi) ve her birinin nereden okunduğu. Bunlar yalnızca başlangıçtır: her birini orijinal ilanda kontrol edin. Yayın tarihi ("published") kaynak nerede veriyorsa oradan okunur: ilanın verisi, liste, metindeki "Posted: …" gibi bir ifade ya da ilanın adresi (RIKEN'in `/20250512_1/` gibi adresleri). Sabit son başvuru günü olmayan ("until filled") ve 60 günden eski bir ilanda **"possiblyFilled"** satırı çıkar: önce pozisyonun hâlâ açık olduğunu kontrol edin.
- **"Source text"**: ilanın metni; kişi adları, e-posta adresleri ve telefon numaraları "[name]", "[email]", "[phone]" ile değiştirilmiş olarak. Sitede hiç görünmez ve karardan 30 gün sonra silinir. Kural tabanlıdır; bir ad gözden kaçabilir.
- **"Suggested tags"**: başlıkta ve metinde geçen sözcüklere göre önerilen alt alan, yöntem, model sistem, pozisyon türü ve kariyer aşaması (yapay zekâ değil, sözcük eşleştirme). Aday kabul edilince taslak ilan bunlarla ve programın okuduğu son başvuru tarihiyle başlar; ilanda kontrol edip düzeltin.
- Program, son başvuru tarihi geçmiş, sinirbilimle ilgisiz görünen ya da zaten aday veya ilan olarak kayıtlı ilanları aday yapmaz; sabit son başvuru günü olmayıp **6 aydan (180 günden) önce yayımlanmış** ilanları da atlar ("Skipped: no deadline, and published over 6 months ago"): böyle bir ilan büyük olasılıkla doldurulmuştur. Bunu yalnızca tarih ilanın verisinde, listede ya da adresinde yazıyorsa yapar; tarih yalnızca metinde geçiyorsa ilanı atlamaz, "possiblyFilled" ile işaretler. Neden aday yapılmadığını **"Postings seen"** listesinde görebilirsiniz ("Outcome"). Sinirbilimle ilgisiz sayılmış ama ilgili bir ilan görürseniz elle aday olarak ekleyin.
- **Sinirbilim sözcükleri nasıl sayılır?** Başlıkta bir sinirbilim sözcüğü ya da metinde en az iki tane olmalıdır. İşveren biriminin adı sayılmaz: "Department of Clinical Neuroscience", "Queensland Brain Institute", "Klinik für Neurologie" gibi adlar her ilanda geçtiği için metinde (başlıkta değil) atlanır; kurumun kendi adları da öyle. Bir kaynağın ilanlarında küçük harfle yazılmış bir birim adı yine de sayılıyorsa, kaynağın **"Names that do not count as neuroscience"** alanına her satıra bir ad yazın (ör. `clinical neuroscience`). Laboratuvar ve grup adları ("Neural Circuits Lab") sayılır, çünkü ne üzerine çalışıldığını söyler.
- Metni kısmen **büyük harfi olmayan bir yazıyla** (Çince, Japonca, Korece, Arapça, İbranice, Tayca, Hint yazıları…) yazılmış adaylar yapay zekâ taslağına gönderilmez (bölüm 6): bu yazılardaki kişi adlarını kurallar bulamaz. Bunların özetini elle yazın. Bu yüzden insanları bu yazılarla adlandıran listeler (CEBSIT'in üç Çince listesi) elle kontrol edilir; CEBSIT'in İngilizce listesini program okur.
- **"Monitor runs"**: programın her kaynağı her okuyuşunun kaydı (Sources altında): listede kaç ilan vardı ("Listed"), kaçı yeniydi ("New"), kaç aday yapıldı ("Candidates") ve kaçı neden atlandı: "Not neuroscience", "Closed" (son başvuru geçmiş ya da sayfa kalkmış), "Duplicates" ve "Left for later" (bir okumada en çok 40 yeni ilan okunur, kalanı ertesi gün). Başarısız bir okumada "Error" nedenini söyler. Bir kaynağın kayıtları için "Source" ile süzün. Kayıtlar bir yıl saklanır; ilan metni ya da adresi içermez.

**Panodaki "Sources" kutusu** ("Waiting for an editor" kutusunun altında):

- **"New candidates from sources"**: kaynaklardan gelen ve henüz bakılmamış ("New") adaylar, kaynağa göre.
- **"Sources that need attention"**: dikkat gerektiren kaynaklar ve nedenleri (yukarıya bakın).
- **"Manual sources due for a look"**: zamanı gelmiş elle kontrol edilecek kaynaklar. "open the page" sayfayı açar; baktıktan sonra kaynakta "Looked at today" kutusunu işaretleyin.
- **"Weekly link check of published jobs"**: program her pazar, yayımlanmış her ilanın orijinal sayfasını açar. Sayfa kalkmışsa ("Page gone"), yanıt vermiyorsa ("Page not answering") ya da pozisyonun dolduğunu veya kapandığını yazıyorsa ("Page says the position is filled or closed"), ilan bu listeye girer. **Hiçbir ilan kendiliğinden kapanmaz.** İlanı ve orijinal sayfayı açın: pozisyon gerçekten kapandıysa ilanı "Withdrawn" ya da süresi dolmuş olarak kapatın; uyarı yanlışsa ilanın sağ sütunundaki **"The link check's warning is wrong"** kutusunu işaretleyip kaydedin (bir sonraki kontrol başka bir şey bulursa ilan yeniden listeye girer). Kontrolün ne bulduğu ilanın sağ sütununda, "Link check found" alanında yazar.

**İlk kaynaklar**: CSV'deki 70 işveren ve alt birimleri, toplam 118 kaynak, 2026-10-16'da resmî sitelerinden incelenip eklendi. Her kaynağın "Notes" alanında incelemenin notları (platform, ilanlardaki son başvuru biçimi, `robots.txt`), elle kontrol edilenlerde nedeni yazar. İşverenin kurumu ROR kimliğiyle bağlandı; bağlanamadıysa notlarda ROR kimliği yazar, "Institution" alanından seçin.

**İkinci tur** (2026-10-17): 51 yeni kaynak eklendi, çoğu daha önce otomatik kaynağı olmayan ülkelerden (Brezilya, Şili, Meksika, Uruguay, İsrail, Katar, Pakistan, Singapur, Hong Kong, Estonya, Hırvatistan, Slovenya, Norveç) ve ABD ile Avrupa'nın büyük sinirbilim işverenlerinden. Bazı elle kontrol edilen kaynaklar artık program tarafından okunuyor (Janelia, CSHL, McGill, EMBL, DZNE, Helmholtz Munich, Oxford, Duke-NUS). Elle kontrol edilen ve nadiren değişen 27 kaynak **"Monthly"** yapıldı: panoda ayda bir görünürler. Yeni otomatik kaynaklar, teknik yönetici her birini bir kez elle çalıştırana kadar kapalıdır ("Monitor on" işaretsiz). NUS ve Duke-NUS, NUS'un hukuki metni bir tarayıcıda okunana kadar kapalı kalır. Bütün liste: `docs/sources/sources-2026-10-17.csv`.

## 6. Yapay zekâ taslakları ("AI draft")

Bazı adaylarda **"AI draft"** alanı doludur (adayın sayfasında "In plain words" kutusunda okunur; bölüm 5): Claude'un (Anthropic) adayın kişi adları, e-posta adresleri ve telefon numaraları çıkarılmış başlığından ve metninden yazdığı bir taslak (D52). Taslakta kendi sözlerimizle en çok 280 karakterlik bir özet ("summary"), pozisyon türü, son başvuru tarihi ve saat dilimi, yer, alt alanlar ve kariyer aşaması bulunur; her biri neye dayandığını söyler ("from"). Taslak sitede hiçbir zaman görünmez.

- Taslaklar şimdilik **haftada bir** gelir: teknik yönetici Claude Code'a "Do the weekly drafts" der; Claude Code bekleyen adayları sunucudan dışa aktarır, taslakları yazar ve geri yükler. İleride Claude API ile her gün de gelebilir (bir anahtar ve aylık harcama sınırı girilene kadar kapalıdır).
- Metni kısmen büyük harfi olmayan bir yazıyla (Çince, Japonca, Korece, Arapça, İbranice, Tayca…) yazılmış adaylar taslağa gönderilmez ve taslaksız kalır: bu yazılardaki kişi adlarını kurallar bulamaz. Onların özetini siz yazarsınız.
- Adayı kabul ettiğinizde ("Accepted"), **"Start the job from the AI draft"** işaretliyse taslak ilan özetini, pozisyon türünü, son başvuru tarihini, alt alanları ve kariyer aşamasını taslaktan alır ve "Drafted with AI assistance" işaretlenir. Taslağı kullanmak istemiyorsanız kabul etmeden önce bu kutuyu kaldırın.
- **Her bilgiyi orijinal ilanda kontrol edin**, özeti gerekirse yeniden yazın: yayımlanan metnin sorumluluğu sizdedir. Taslak bir kişi adı içeriyorsa ya da notunda "A name was left in the source text" yazıyorsa adı yayımlamayın ve teknik yöneticiye bildirin.

## 7. Alt alan sayfalarının giriş metinleri

Her alt alanın (ör. "Glial biology") sitede kendi sayfası vardır, ör. `/en/subfields/glia/`. Sayfanın üstünde, o alt alanın **"Hub introduction"** alanına yazdığınız giriş metni görünür. Arama motorları bir alt alan sayfasını İngilizce giriş metni en az 150 sözcük olduğunda listeler; o zamana kadar sayfa `noindex` kalır (D40). Alanın altındaki sayaç sözcükleri sitenin saydığı gibi sayar.

Her alt alanda bir de **"AI draft of the introduction"** alanı vardır: bir yapay zekâ asistanıyla (Claude Code) yalnızca alt alanların adlarından ve tanımlarından yazılmış, 170–250 sözcüklük İngilizce bir ilk taslak (D53). Taslağı yalnızca editörler görür; sitede hiçbir zaman gösterilmez ve arama motorları onu görmez. Sitede yalnızca sizin yazdığınız "Hub introduction" görünür ve onun sorumluluğu sizdedir, ilanlarda olduğu gibi.

Bir taslaktan giriş metni yazmak:

1. Soldaki menüden **Taxonomy → Terms**'e girin ve "Vocabulary" sütununda "Subfield" yazan bir terimi açın. Sayfanın üstündeki dil seçicisi **English** olmalı: Türkçe giriş metinleri sonra gelecek.
2. **"AI draft of the introduction"** alanını okuyun ve her cümleyi kendi bilginizle karşılaştırın: alanın neyi incelediği, tipik soruları ve yöntemleri, sunduğu pozisyonlar, ilişkili alt alanlar ("Related hubs"). Yanlış, abartılı ya da kaynak gerektiren bir cümleyi çıkarın.
3. Kendi metninizi **"Hub introduction"** alanına yazın; taslaktan kopyalayıp düzenleyebilirsiniz. Paragrafları bir boş satırla ayırın; 150–300 sözcük olsun.
4. Kişi ya da laboratuvar adı, tıbbi tavsiye ve kaynak isteyen bir iddia (sayılar, "en büyük", "en hızlı büyüyen" gibi) eklemeyin (D19).
5. **Save**'e basın. Sayaç 150'yi geçtiyse sayfa arama motorlarına açılır (site genel parolanın arkasındayken kimse göremez). Taslak alanını olduğu gibi bırakabilir ya da boşaltabilirsiniz; bu sitede hiçbir şeyi değiştirmez.

Taslakların hepsi sözcük sayılarıyla birlikte `docs/subfield-introductions.md` dosyasında da okunabilir.

## 8. Glia Notes sayısı hazırlamak

Glia Notes ayda bir gönderilir: her ayın ilk salı günü, 13:00 UTC'de (Türkiye saatiyle 16:00; D16). İlk sayı, sitenin herkese açıldığı gün gönderilen **açılış sayısıdır** (D41). Bir sayıda şimdilik iki bölüm vardır: önümüzdeki 45 gündeki son başvuru tarihleri ve seçilmiş pozisyonlar; makaleler, fonlar, haberler ve Learn kendi bölümleri yapıldıkça eklenir. Sayılar yalnızca İngilizcedir.

Soldaki menüde **Glia Notes → Glia Notes issues** bölümü vardır. Açılış sayısı orada taslak olarak hazır bekler ("Gliagora is open: …").

Bir sayı hazırlamak:

1. Yeni bir sayı için **Create New**'a basın (açılış sayısında taslağı açın). **"Date and time"** kendiliğinden bir sonraki ayın ilk salısı, 13:00 UTC olur; tarih bilgisayarınızın saatiyle gösterilir (Türkiye'de 16:00). Açılış sayısında tarihi açılış gününe ayarlayın. Ay ("month") tarihten gelir: her ay için tek sayı olur, arşiv adresi `/en/newsletter/{ay}/` olur.
2. **"Subject"** (konu), **"Preheader"** (gelen kutusunda konunun yanında görünen kısa satır) ve **"Opening note"** (açılış notu: kendi sözlerinizle iki üç cümle) alanlarını yazın. Açılış sayısında bu alanlar için bir taslak hazırdır; düzenleyin.
3. **"Selected positions"**: yeni sayı kaydedilince program on iki açık pozisyon önerir: en yenilerden, bölgeler sırayla, her birinde henüz seçilmemiş bir alt alandan, bir önceki sayıdakiler dışında. Sürükleyerek sıralayın, çıkarın ya da ekleyin (10–15 pozisyon). Açılış sayısında, ya da öneriyi yenilemek istediğinizde, **"Propose the selected positions again when I save"** kutusunu işaretleyip kaydedin.
4. **Save**'e basın. Son başvuru tarihleri bölümü kendiliğinden dolar: sayının tarihinden sonraki 45 gün içinde son başvurusu olan açık pozisyonlar, en yakını önce (en çok 40; fazlası listeye bağlantıyla).
5. Sağ sütundaki **"Preview and send"** kutusunda **"Preview the email"** e-postayı yeni bir sekmede gösterir, **"Preview the plain text"** düz metin hâlini. Önizleme kaydedilmiş sayıyı gösterir: önce kaydedin.
6. **"Send a test email"** sayının bir denemesini size ve deneme adreslerine (Gmail, Outlook, Yahoo ve bir Türk sağlayıcısındaki kendi hesaplarımız) gönderir; konusunun başında "[Test]" yazar. Her birinde e-postanın nasıl göründüğüne, bağlantılara ve karanlık moda bakın. Denemedeki abonelikten çıkma bağlantıları hiçbir şeyi değiştirmez. Deneme e-postaları posta sunucusu kurulunca (M2) gider; o zamana kadar önizlemeyi kullanın.

7. **"Push to listmonk as a draft"** sayıyı bülten sistemine (listmonk) taslak olarak gönderir: **hiçbir e-posta gitmez**. Her gönderim kaydedilmiş sayıyı o anki hâliyle gönderir; sonra değiştirirseniz kaydedip yeniden gönderin.
8. **"Schedule in listmonk"** sayıyı tarihine planlar; onaylamanız istenir. O tarihte Glia Notes'un bütün abonelerine gider. Planlanmış bir sayının alanları kilitlenir: değiştirmek için **"Unschedule (back to a draft)"** ile taslağa geri alın, değiştirin, kaydedin ve yeniden planlayın.
9. Site listmonk'u her 10 dakikada bir sorar: sayının durumu ("status") önce "Sending", sonra **"Sent"** olur; "Sent" alanında gönderimin başladığı an yazar. Gönderilen sayı arşivde görünür: `/en/newsletter/archive/` ve `/en/newsletter/{ay}/` (site herkese açılana kadar genel parolanın arkasında).

**Sayıyı listmonk'a göndermek açılışa kadar kapalıdır** (D53): o zamana kadar düğmeler "switched off until the launch" der. Önizleme ve deneme e-postası her zaman çalışır.

Gönderilen bir sayı değişmez ve silinemez; listmonk'a gönderilmiş bir sayı da silinemez. Sayıları listmonk'un kendi yönetim panelinde düzenlemeyin.

**Açılış günü** (D41): Glia Notes issues listesinde hazır bekleyen açılış sayısını açın; tarihini açılış gününe ve saatine ayarlayın, **"Propose the selected positions again when I save"** kutusunu işaretleyip kaydedin, açılış notunu düzenleyin ve kaydedin; önizleyin, kendinize bir deneme gönderin, sonra planlayın (adım 7–8).

Bir sayı kapanmış bir pozisyonu göstermez: seçtiğiniz bir pozisyon sayının tarihinden önce kapanırsa sayıdan çıkar. Sayılarda hiçbir aboneye ait bilgi yoktur.
