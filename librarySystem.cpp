+


struct Book{
    string title;
    string author;
    bool isBorrowed = false;
    int borrowedByID;
};
struct Member{
    string name;
    int phoneNum;
    int ID;
};



void bookFunction(vector<Book>& books){ // TO ADD BOOKS
    string title, author;
    cout << "\n--- Add New Book ---\n";
    do{
        cout << "Enter the book's title: ";
        getline(cin, title);
        if(title.empty()){
            cout << "Title cannot be empty. Try again \n"; }
        } while(title.empty());
    ofstream file1("booklog.txt", ios::app);
    file1 << title << "\n";
    file1.close();
    
    do{
    cout << "Author's name: ";
    getline(cin, author);
    if(author.empty()){
        cout << "Author cannot be empty. Try again \n"; }
    } while(author.empty());

    ofstream file2("authorslog.txt", ios::app);
    file2 << author << "\n";
    file2.close();

    Book newBook;
    newBook.title = title;
    newBook.author = author;

    books.push_back(newBook);

    cout << "\nBook added successfully!\n";
    cout << "Title: " << title << endl;
    cout << "Author: " << author << endl;

}

void memberFunction(vector<Member>& members){ // TO ADD MEMBERS
    string name;
    int ID;
    double phoneNum;

    cout << "Enter your name: ";
    getline(cin, name);
    ofstream file3("namelog.txt", ios::app);
    file3 << name << "\n";
    file3.close();

    cout << "Enter your ID(100/101/102): ";
    cin >> ID;
    ofstream file4("IDlog.txt", ios::app);
    file4 << ID << "\n";
    file4.close();

    cout << "Enter your phone number: ";
    cin >> phoneNum;
    ofstream file5("phoneNumlog.txt", ios::app);
    file5 << phoneNum << "\n";
    file5.close();
    cin.ignore(numeric_limits<streamsize>::max(), '\n');

    Member newMember;

    newMember.name = name;
    newMember.ID = ID;
    newMember.phoneNum = phoneNum;

    members.push_back(newMember);
    cout << "\nMember registered successfully!\n";

}
void displayBooks(vector<Book>& books){ // DISPLAY ALL THE BOOKS
    if (books.empty()){
        cout << "No books yet!";
        return;
    }
    cout << "\n---All books---\n";
    for (int i=0; i<books.size() ; i++){
    if (books[i].isBorrowed){
        cout << books[i].title << " (Borrowed by ID: " << books[i].borrowedByID << ")\n"; }
    else{
    cout << books[i].title << " (Available)\n";}
}
}
void displayMembers(vector<Member>& members){ // DISPLAY ALL THE MEMBERS
    if(members.empty()){
        cout << "\nNo members registered yet!\n";
        return;
    }

    cout << "\n--- All Members ---\n";
    for(int i = 0; i < members.size(); i++){
        cout << i+1 << ". " << members[i].name << " (ID: " << members[i].ID << ", Phone: " << members[i].phoneNum << ")\n";
    }
    cout << endl;
}

void loadBooksFromFile(vector<Book>& books){ //LOAD BOOKS FROM BOOKLOG.TXT
    ifstream titleFile("booklog.txt");
    ifstream authorFile("authorslog.txt");
    ifstream borrowFile("borrowlog.txt");

     if (!titleFile.is_open() || !authorFile.is_open()) {
        return; // Files don't exist yet
    }

    string title, author;
    int isBorrowed, borrowedByID;
    while (getline(titleFile, title) && getline(authorFile, author)){
        Book newBook;
        newBook.title = title;
        newBook.author = author;
        if (borrowFile.is_open() && (borrowFile >> isBorrowed >> borrowedByID)) {
            newBook.isBorrowed = isBorrowed;
            newBook.borrowedByID = borrowedByID;
        } else {
            newBook.isBorrowed = false;
            newBook.borrowedByID = -1;
        }

        books.push_back(newBook);
    }
    titleFile.close();
    authorFile.close();
    borrowFile.close();
}

void loadMembersFromFile(vector<Member>& members) {
    ifstream nameFile("namelog.txt");
    ifstream idFile("IDlog.txt");
    ifstream phoneFile("phoneNumlog.txt");
    
    if (!nameFile.is_open() || !idFile.is_open() || !phoneFile.is_open()) {
        return;
    }
    
    string name;
    int id, phone;
    while (getline(nameFile, name) && (idFile >> id) && (phoneFile >> phone)) {
        Member newMember;
        newMember.name = name;
        newMember.ID = id;
        newMember.phoneNum = phone;
        members.push_back(newMember);
    }
    
    nameFile.close();
    idFile.close();
    phoneFile.close();
}

string toLowerCase(string str) {
    transform(str.begin(), str.end(), str.begin(), ::tolower);
    return str;
}

void searchBooksAuthor(vector<Book>& books){

    string searchterm;
    bool found = false;

    cout << "Enter the book's / author's name: ";
    getline(cin, searchterm);

    searchterm = toLowerCase(searchterm);

    cout << "\nSearching...\n";
    for (int i=0; i < books.size(); i++){
        string titleLower = toLowerCase(books[i].title);
        string authorLower = toLowerCase(books[i].author);

        if (titleLower.find(searchterm) != string::npos || 
            authorLower.find(searchterm) != string::npos){
            cout << "Book Found!" << endl;
            cout << books[i].title << " is by " << books[i].author << "\n";
            found = true;
        }
    }
    if (!found) {
    cout << "Book not found. Try again.\n";
    
}
}

void editBooksAuthor(vector<Book>& books){
    int choice, editBooks, editAuthor;
    string newBookName, newAuthorName;
    int j = 1;

    cout << "--Edit Books / Author--\n"
            "1: Books\n"
            "2: Author" << endl;
    cout << "Enter your choice: ";
    cin >> choice;
    while (cin.fail()) {
        cin.clear();
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << "Invalid, Try again." << endl;
        cout << "Enter your choice: ";
        cin >> choice; }
    cout << "\n";

    if (choice == 1){
        for (int i=0; i < books.size(); i++){
            cout << j << ":" << books[i].title << "\n";
            j++;
        }
        cout << "\nSelect the books you want to edit: ";
        cin >> editBooks;
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        while (cin.fail()) {
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            cout << "Invalid, Try again." << endl;
            cout << "Select the books you want to edit: ";
            cin >> editBooks; }

        cout << "\nEnter the new name: ";
        getline(cin, newBookName);

        books[editBooks - 1].title = newBookName;

        ofstream fileEditBook("booklog.txt");
        for(int i = 0; i < books.size(); i++){
            fileEditBook << books[i].title << endl;
        }
        fileEditBook.close();

        cout << "\nBooks editted succesfully!" << "\n";

    }

    if (choice == 2){

        for (int i=0; i < books.size(); i++){
            cout << j << ":" << books[i].author << "\n";
            j++;
        }
        
        cout << "\nSelect the author you want to edit: ";
        cin >> editAuthor;
        cin.ignore(numeric_limits<streamsize>::max(), '\n');

        cout << "\nEnter the new name: ";
        getline(cin, newAuthorName);

        books[editAuthor - 1].author = newAuthorName;

        ofstream fileEditAuthor("authorslog.txt");
        for(int i = 0; i < books.size(); i++){
            fileEditAuthor << books[i].author << endl;
        }
        fileEditAuthor.close();

        cout << "\nAuthor editted succesfully!" << "\n";
    }
}
void editMembers(vector<Member> &members){
    int j = 1 , optionMember, editOption;
    string newName;
    int newID;
    double newPhone;

    cout << "--Editing Members--\n";
    for(int i=0; i < members.size(); i++){
        cout << j << ":" << members[i].name << endl;
        j++;
    }

    cout << "\nWhich member do you want to edit: ";
    cin >> optionMember;
    while (cin.fail() || optionMember < 1 || optionMember > members.size()){
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            cout << "Invalid, Try again." << endl;
            cout << "Which member do you want to edit: ";
            cin >> optionMember; }

    cout    << "\nName: " << members[optionMember - 1].name << "\n"
            << "ID: " << members[optionMember - 1].ID << "\n"
            << "Phone: " << members[optionMember - 1].phoneNum << "\n";

    cout << "\nWhat do you want to edit?\n"
         << "1: Name\n"
         << "2: ID\n"
         << "3: Phone Num\n";
    cin >> editOption;
    while (cin.fail()) {
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            cout << "Invalid, Try again." << endl;
            cout << "\nWhat do you want to edit?\n"
                 << "1: Name\n"
                 << "2: ID\n"
                 << "3: Phone Num\n";
            cin >> editOption; }
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            
    if(editOption == 1){
        cout << "Enter new name: " << endl;
        getline(cin, newName);

        members[optionMember -1].name = newName;
        ofstream filenewName("namelog.txt");
        for(int i=0; i < members.size(); i++){
            filenewName << members[i].name << endl;
        }
        filenewName.close();
    }
    else if(editOption == 2){
        cout << "Enter new ID: " << endl;
        cin >> newID;

        members[optionMember - 1].ID = newID;
        ofstream filenewID("IDlog.txt");
        for(int i=0; i < members.size(); i++){
            filenewID << members[i].ID << endl;
        }
        filenewID.close();
}
    else if(editOption == 3){
        cout << "Enter new phone number: " << endl;
        cin >> newPhone;

        members[optionMember - 1].phoneNum = newPhone;
        ofstream filenewPhone("phoneNumlog.txt");
        for(int i=0; i < members.size(); i++){
            filenewPhone << members[i].phoneNum << endl;
        }
        filenewPhone.close();
    }

    cout << "Editted Succesfully!\n";
}


void borrowBook(vector<Book>& books, vector<Member>& members){
    int memberID, optionBorrow;

    cout << "Enter your member ID: ";
    cin >> memberID;
    cin.ignore(numeric_limits<streamsize>::max(), '\n');

    bool memberFound = false;
    for(int i=0; i < members.size(); i++){ // FIXED: members.size() not members.size
        if(members[i].ID == memberID){
            memberFound = true;
            break;
        }
    }
    if(!memberFound){
        cout << "\nMember ID not found!";
        return;
    }

    bool availableBook = false;
    for (int i=0; i<books.size() ; i++){
        if(!books[i].isBorrowed){
            cout << i+1 << ". " << books[i].title << " by (" << books[i].author << ")\n";
            availableBook = true;
        }
    } 

    if(!availableBook){
        cout << "No book available to borrow\n"; 
        return;
    }
        
    cout << "Which book do you want to borrow: ";
    cin >> optionBorrow;
    cin.ignore(numeric_limits<streamsize>::max(), '\n');

    int bookChoice = optionBorrow - 1; 

    if(bookChoice < 0 || bookChoice >= (int)books.size() || books[bookChoice].isBorrowed){ 
        cout << "Invalid Choice!";
        return;
    }
    
    books[bookChoice].isBorrowed = true;
    books[bookChoice].borrowedByID = memberID; 
    cout << "\nSuccessfully borrowed: " << books[bookChoice].title << "!\n";

    ofstream fileBorrowed("booklog.txt");
    ofstream fileAuthor("authorslog.txt");
    ofstream fileBorrowStatus("borrowlog.txt");

    for (int i = 0; i < books.size(); i++) {
        fileBorrowed << books[i].title << "\n";
        fileAuthor << books[i].author << "\n";
        fileBorrowStatus << books[i].isBorrowed << " " << books[i].borrowedByID << "\n";
    }
    fileBorrowed.close();
    fileAuthor.close();
    fileBorrowStatus.close();   
}

int main(){

    int option;
    vector<Book> books;
    vector<Member> members;

    loadBooksFromFile(books);
    loadMembersFromFile(members);

    cout << "\n";
    cout << "------------------------" << endl;
    cout << "Welcome to Apip Library!" << endl;
    cout << "------------------------" << endl;
    
    do{
        cout << "\n~~~~~~~~~~~~~~~~~~~~~~~" << endl;
        cout << "\tOptions";
        cout << "\n~~~~~~~~~~~~~~~~~~~~~~~" << endl;

        cout << "1: Add Books \n2: Add Members \n3: Display Books \n4: Display Members \n5: Search Books \n6: Edit Books / Author \n7: Edit Member \n8: Borrow Book \n9: Exit\n";

        cout << "Choose option (1/2/3/4/5/6/7/8/9): ";
        cin >> option;
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << "\n";
        while (cin.fail()) {
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            cout << "Invalid, Try again." << endl;
            cout << "Choose option (1/2/3/4/5/6/7/8/9):";
            cin >> option; }

        switch (option){
            case 1:
                bookFunction(books);
                break;

            case 2:
                memberFunction(members);
                break;

            case 3:
                displayBooks(books);
                break;

            case 4:
                displayMembers(members);
                break;

            case 5:
                searchBooksAuthor(books);
                break;
            
            case 6:
                editBooksAuthor(books);
                break;

            case 7:
                editMembers(members);
                break;

            case 8:
                borrowBook(books, members);
                break;

            case 9:
                cout << "Thank you for visiting. See you again";
                return 0;
                
            default:
                cout << "Invalid option.. Try again.\n";
        }
    }while (option != 9);

    return 0;
}